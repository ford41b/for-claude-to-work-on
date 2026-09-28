-- Retrieval chunks (+ embeddings), chat, study guides, and search functions.

create table public.source_chunks (
  id uuid primary key default gen_random_uuid(),
  sermon_id uuid not null references public.sermons (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  source_id uuid not null references public.sermon_sources (id) on delete cascade,
  source_type public.source_type not null,
  chunk_index integer not null,
  text text not null,
  content_hash text not null,
  timestamp_start double precision,
  timestamp_end double precision,
  note_block_ids text[] not null default '{}',
  page integer,
  section_title text,
  embedding extensions.vector(768),
  embedding_model text,
  created_at timestamptz not null default now(),
  tsv tsvector generated always as (to_tsvector('english', coalesce(section_title, '') || ' ' || text)) stored,
  unique (source_id, chunk_index)
);
create index source_chunks_sermon_idx on public.source_chunks (sermon_id);
create index source_chunks_user_idx on public.source_chunks (user_id);
create index source_chunks_tsv_idx on public.source_chunks using gin (tsv);
create index source_chunks_embedding_idx on public.source_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  sermon_id uuid references public.sermons (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index chat_threads_sermon_idx on public.chat_threads (sermon_id, updated_at desc);
create trigger chat_threads_updated_at before update on public.chat_threads
  for each row execute function public.set_updated_at();

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  sermon_id uuid references public.sermons (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 20000),
  -- For assistant messages: { confidence, sermon_supported, general_background, question_type,
  --   citation_stats } — citations live in source_citations (subject_type='chat_message').
  answer jsonb,
  status text not null default 'complete' check (status in ('complete', 'failed')),
  provider text,
  model text,
  prompt_version text,
  usage jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index chat_messages_thread_idx on public.chat_messages (thread_id, created_at);

create table public.study_guides (
  id uuid primary key default gen_random_uuid(),
  sermon_id uuid not null references public.sermons (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  artifact_id uuid references public.ai_artifacts (id) on delete set null,
  format text not null check (format in (
    'five_minute', 'fifteen_minute', 'thirty_minute', 'deep', 'small_group', 'youth', 'personal', 'family'
  )),
  title text not null default '' check (char_length(title) <= 300),
  status text not null default 'generating' check (status in ('generating', 'ready', 'failed')),
  -- { big_idea, primary_scripture, sections: [{ key, heading, body, items[], source_keys[] }] }
  content jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index study_guides_sermon_idx on public.study_guides (sermon_id, created_at desc);
create trigger study_guides_updated_at before update on public.study_guides
  for each row execute function public.set_updated_at();

alter table public.source_chunks enable row level security;
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
alter table public.study_guides enable row level security;
revoke all on public.source_chunks, public.chat_threads, public.chat_messages, public.study_guides
  from anon, authenticated;
grant select on public.source_chunks, public.chat_threads, public.chat_messages, public.study_guides to authenticated;
grant delete on public.chat_threads, public.study_guides to authenticated;

create policy "source_chunks: owner read" on public.source_chunks
  for select to authenticated using (user_id = (select auth.uid()));
create policy "chat_threads: owner read" on public.chat_threads
  for select to authenticated using (user_id = (select auth.uid()));
create policy "chat_threads: owner delete" on public.chat_threads
  for delete to authenticated using (user_id = (select auth.uid()));
create policy "chat_messages: owner read" on public.chat_messages
  for select to authenticated using (user_id = (select auth.uid()));
create policy "study_guides: owner read" on public.study_guides
  for select to authenticated using (user_id = (select auth.uid()));
create policy "study_guides: owner delete" on public.study_guides
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Hybrid retrieval (vector + full text, reciprocal rank fusion). Security invoker: RLS applies,
-- so a user can only ever retrieve their own chunks.
-- ---------------------------------------------------------------------------
create or replace function public.match_source_chunks(
  p_sermon_id uuid,
  p_query_text text,
  p_query_embedding extensions.vector(768) default null,
  p_match_count integer default 12
)
returns table (
  id uuid,
  source_id uuid,
  source_type public.source_type,
  text text,
  timestamp_start double precision,
  timestamp_end double precision,
  note_block_ids text[],
  page integer,
  section_title text,
  score double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select case
      when coalesce(trim(p_query_text), '') = '' then null
      else nullif(replace(plainto_tsquery('english', p_query_text)::text, ' & ', ' | '), '')::tsquery
    end as tsq
  ),
  vec as (
    select c.id, row_number() over (order by c.embedding operator(extensions.<=>) p_query_embedding) as r
    from public.source_chunks c
    where p_query_embedding is not null
      and c.sermon_id = p_sermon_id
      and c.embedding is not null
    order by c.embedding operator(extensions.<=>) p_query_embedding
    limit greatest(p_match_count, 1) * 3
  ),
  fts as (
    select c.id, row_number() over (order by ts_rank_cd(c.tsv, q.tsq) desc) as r
    from public.source_chunks c, q
    where q.tsq is not null
      and c.sermon_id = p_sermon_id
      and c.tsv @@ q.tsq
    order by ts_rank_cd(c.tsv, q.tsq) desc
    limit greatest(p_match_count, 1) * 3
  ),
  fused as (
    select u.id, sum(1.0 / (60 + u.r)) as score
    from (select * from vec union all select * from fts) u
    group by u.id
  )
  select c.id, c.source_id, c.source_type, c.text, c.timestamp_start, c.timestamp_end,
         c.note_block_ids, c.page, c.section_title, f.score::double precision
  from fused f
  join public.source_chunks c on c.id = f.id
  order by f.score desc
  limit greatest(p_match_count, 1);
$$;

-- Library search across sermons, notes, photo text, documents, main ideas, quotes and Scripture.
-- Returns one row per sermon with where it matched and a short snippet. Security invoker.
create or replace function public.search_library(
  p_query text default null,
  p_speaker text default null,
  p_church text default null,
  p_series text default null,
  p_book text default null,
  p_chapter integer default null,
  p_from date default null,
  p_to date default null,
  p_limit integer default 50
)
returns table (sermon_id uuid, rank double precision, matched_in text[], snippet text)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select case when coalesce(trim(p_query), '') = '' then null
                else websearch_to_tsquery('english', p_query) end as tsq
  ),
  base as (
    select s.* from public.sermons s
    where (p_speaker is null or s.speaker ilike p_speaker)
      and (p_church is null or s.church ilike p_church)
      and (p_series is null or s.series ilike p_series)
      and (p_from is null or coalesce(s.preached_on, s.created_at::date) >= p_from)
      and (p_to is null or coalesce(s.preached_on, s.created_at::date) <= p_to)
      and (p_book is null or exists (
        select 1 from public.scripture_references r
        where r.sermon_id = s.id and r.book = p_book and not r.hidden
          and (p_chapter is null or p_chapter between r.chapter_start and coalesce(r.chapter_end, r.chapter_start))
      ))
  ),
  hits as (
    select b.id as sermon_id, ts_rank(b.search_tsv, q.tsq)::double precision * 2 as rank,
           'sermon'::text as kind, null::text as snippet
      from base b, q where q.tsq is not null and b.search_tsv @@ q.tsq
    union all
    select b.id, 0.5, 'title', null from base b
      where p_query is not null and b.title operator(extensions.%) p_query
    union all
    select n.sermon_id, ts_rank(n.search_tsv, q.tsq)::double precision, 'notes',
           ts_headline('english', n.plain_text, q.tsq, 'MaxFragments=1,MaxWords=20,MinWords=8,StartSel=«,StopSel=»')
      from public.notes n join base b on b.id = n.sermon_id, q
      where q.tsq is not null and n.search_tsv @@ q.tsq
    union all
    select o.sermon_id, ts_rank(o.search_tsv, q.tsq)::double precision, 'photos',
           ts_headline('english', o.full_text, q.tsq, 'MaxFragments=1,MaxWords=20,MinWords=8,StartSel=«,StopSel=»')
      from public.ocr_extractions o join base b on b.id = o.sermon_id, q
      where q.tsq is not null and o.is_current and o.search_tsv @@ q.tsq
    union all
    select d.sermon_id, ts_rank(d.search_tsv, q.tsq)::double precision, 'documents',
           ts_headline('english', d.extracted_text, q.tsq, 'MaxFragments=1,MaxWords=20,MinWords=8,StartSel=«,StopSel=»')
      from public.documents d join base b on b.id = d.sermon_id, q
      where q.tsq is not null and d.search_tsv @@ q.tsq
    union all
    select m.sermon_id, ts_rank(m.search_tsv, q.tsq)::double precision * 1.5, 'ideas', m.title
      from public.main_ideas m join base b on b.id = m.sermon_id, q
      where q.tsq is not null and not m.hidden and m.search_tsv @@ q.tsq
    union all
    select qu.sermon_id, ts_rank(qu.search_tsv, q.tsq)::double precision, 'quotes', qu.text
      from public.quotes qu join base b on b.id = qu.sermon_id, q
      where q.tsq is not null and not qu.hidden and qu.search_tsv @@ q.tsq
    union all
    select b.id, 1.0, 'scripture', null from base b where p_book is not null
  ),
  ranked as (
    select h.sermon_id, sum(h.rank) as rank, array_agg(distinct h.kind) as matched_in,
           (array_agg(h.snippet order by h.rank desc) filter (where h.snippet is not null))[1] as snippet
    from hits h group by h.sermon_id
  )
  select r.sermon_id, r.rank, r.matched_in, r.snippet from ranked r
  where p_query is not null or p_book is not null
  union all
  select b.id, 0, '{}'::text[], null from base b
  where p_query is null and p_book is null
  order by 2 desc
  limit greatest(least(p_limit, 200), 1);
$$;

grant execute on function public.match_source_chunks(uuid, text, extensions.vector, integer) to authenticated;
grant execute on function public.search_library(text, text, text, text, text, integer, date, date, integer) to authenticated;
revoke all on function public.match_source_chunks(uuid, text, extensions.vector, integer) from anon, public;
revoke all on function public.search_library(text, text, text, text, text, integer, date, date, integer) from anon, public;
