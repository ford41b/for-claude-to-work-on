-- AI artifacts (incl. versioned Sermon Packs), normalized Pack items, and citations.

create table public.ai_artifacts (
  id uuid primary key default gen_random_uuid(),
  sermon_id uuid references public.sermons (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- For per-source analyses (VIDEO_ANALYSIS, PHOTO_ANALYSIS, …) the analyzed source.
  source_id uuid references public.sermon_sources (id) on delete cascade,
  type public.artifact_type not null,
  status public.artifact_status not null default 'ready',
  version integer not null default 1,
  -- Cache key: hash of (inputs + prompt version + model). Same key → reuse, don't re-bill.
  input_hash text,
  -- For SERMON_PACK: hash over all source content hashes it was built from.
  source_version_hash text,
  provider text not null,
  model text not null,
  prompt_version text not null,
  content text,
  structured_content jsonb,
  input_source_ids uuid[] not null default '{}',
  usage jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index ai_artifacts_pack_version_idx on public.ai_artifacts (sermon_id, version)
  where type = 'SERMON_PACK';
create index ai_artifacts_sermon_type_idx on public.ai_artifacts (sermon_id, type, created_at desc);
create index ai_artifacts_cache_idx on public.ai_artifacts (source_id, type, input_hash) where status = 'ready';
create trigger ai_artifacts_updated_at before update on public.ai_artifacts
  for each row execute function public.set_updated_at();

alter table public.sermons
  add constraint sermons_current_pack_fk foreign key (current_pack_id)
  references public.ai_artifacts (id) on delete set null;
alter table public.ocr_extractions
  add constraint ocr_artifact_fk foreign key (artifact_id)
  references public.ai_artifacts (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Normalized Sermon Pack items.
-- Shared columns: origin (ai|user), user_edited (never overwritten by regeneration),
-- hidden (user dismissed; preserved across regeneration), pack_artifact_id (generating version).
-- ---------------------------------------------------------------------------
create table public.main_ideas (
  id uuid primary key default gen_random_uuid(),
  sermon_id uuid not null references public.sermons (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  pack_artifact_id uuid references public.ai_artifacts (id) on delete set null,
  origin public.item_origin not null default 'ai',
  user_edited boolean not null default false,
  hidden boolean not null default false,
  position integer not null default 0,
  title text not null check (char_length(title) <= 300),
  summary text not null default '',
  explanation text not null default '',
  timestamp_start double precision check (timestamp_start is null or timestamp_start >= 0),
  timestamp_end double precision check (timestamp_end is null or timestamp_end >= 0),
  timestamp_confidence public.confidence_level,
  confidence public.confidence_level not null default 'medium',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_tsv tsvector generated always as (
    to_tsvector('english', title || ' ' || summary || ' ' || explanation)
  ) stored
);

create table public.sermon_sections (
  id uuid primary key default gen_random_uuid(),
  sermon_id uuid not null references public.sermons (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  pack_artifact_id uuid references public.ai_artifacts (id) on delete set null,
  origin public.item_origin not null default 'ai',
  user_edited boolean not null default false,
  hidden boolean not null default false,
  position integer not null default 0,
  title text not null check (char_length(title) <= 300),
  summary text not null default '',
  timestamp_start double precision check (timestamp_start is null or timestamp_start >= 0),
  timestamp_end double precision check (timestamp_end is null or timestamp_end >= 0),
  timestamp_confidence public.confidence_level,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sermon_moments (
  id uuid primary key default gen_random_uuid(),
  sermon_id uuid not null references public.sermons (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pack_artifact_id uuid references public.ai_artifacts (id) on delete set null,
  origin public.item_origin not null default 'ai',
  user_edited boolean not null default false,
  hidden boolean not null default false,
  position integer not null default 0,
  category public.moment_category not null,
  title text not null default '' check (char_length(title) <= 300),
  description text not null default '' check (char_length(description) <= 4000),
  timestamp_start double precision check (timestamp_start is null or timestamp_start >= 0),
  timestamp_end double precision check (timestamp_end is null or timestamp_end >= 0),
  timestamp_confidence public.confidence_level,
  timestamp_source public.timestamp_source not null default 'ai',
  verification_status public.verification_status not null default 'unverified',
  -- The AI's original time, kept when a user corrects it (for timestamp-accuracy metrics).
  original_timestamp_start double precision,
  captured_at timestamptz,
  -- Idempotency key for offline-created captures.
  client_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.scripture_references (
  id uuid primary key default gen_random_uuid(),
  sermon_id uuid not null references public.sermons (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pack_artifact_id uuid references public.ai_artifacts (id) on delete set null,
  origin public.item_origin not null default 'ai',
  user_edited boolean not null default false,
  hidden boolean not null default false,
  position integer not null default 0,
  reference_text text not null check (char_length(reference_text) <= 200),
  normalized_reference text not null check (char_length(normalized_reference) <= 200),
  osis text not null check (char_length(osis) <= 200),
  book text not null,
  chapter_start integer,
  verse_start integer,
  chapter_end integer,
  verse_end integer,
  kind public.scripture_kind not null default 'explicit',
  confidence public.confidence_level not null default 'medium',
  role text not null default 'mentioned' check (role in ('primary', 'supporting', 'mentioned')),
  sermon_context text not null default '',
  timestamp_start double precision check (timestamp_start is null or timestamp_start >= 0),
  timestamp_confidence public.confidence_level,
  client_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  sermon_id uuid not null references public.sermons (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  pack_artifact_id uuid references public.ai_artifacts (id) on delete set null,
  origin public.item_origin not null default 'ai',
  user_edited boolean not null default false,
  hidden boolean not null default false,
  position integer not null default 0,
  text text not null check (char_length(text) <= 2000),
  quote_type public.quote_type not null default 'PARAPHRASE',
  -- Why this counts as verbatim (e.g. 'matched_user_note', 'matched_photo', 'heard_high_confidence').
  verbatim_evidence text,
  attributed_to text,
  context text not null default '',
  timestamp_start double precision check (timestamp_start is null or timestamp_start >= 0),
  timestamp_confidence public.confidence_level,
  confidence public.confidence_level not null default 'medium',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (quote_type <> 'VERBATIM_QUOTE' or verbatim_evidence is not null or origin = 'user'),
  search_tsv tsvector generated always as (to_tsvector('english', text || ' ' || context)) stored
);

create table public.illustrations (
  id uuid primary key default gen_random_uuid(),
  sermon_id uuid not null references public.sermons (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  pack_artifact_id uuid references public.ai_artifacts (id) on delete set null,
  origin public.item_origin not null default 'ai',
  user_edited boolean not null default false,
  hidden boolean not null default false,
  position integer not null default 0,
  title text not null check (char_length(title) <= 300),
  summary text not null default '',
  kind text not null default 'story' check (kind in ('story', 'example', 'analogy', 'personal', 'historical', 'other')),
  timestamp_start double precision check (timestamp_start is null or timestamp_start >= 0),
  timestamp_end double precision check (timestamp_end is null or timestamp_end >= 0),
  timestamp_confidence public.confidence_level,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  sermon_id uuid not null references public.sermons (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pack_artifact_id uuid references public.ai_artifacts (id) on delete set null,
  origin public.item_origin not null default 'ai',
  user_edited boolean not null default false,
  hidden boolean not null default false,
  position integer not null default 0,
  text text not null check (char_length(text) <= 1000),
  detail text not null default '',
  status public.application_status not null default 'open',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  sermon_id uuid not null references public.sermons (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pack_artifact_id uuid references public.ai_artifacts (id) on delete set null,
  origin public.item_origin not null default 'user',
  user_edited boolean not null default false,
  hidden boolean not null default false,
  position integer not null default 0,
  text text not null check (char_length(text) between 1 and 2000),
  status public.question_status not null default 'open',
  answer text check (answer is null or char_length(answer) <= 10000),
  answered_at timestamptz,
  for_group boolean not null default false,
  timestamp_seconds double precision check (timestamp_seconds is null or timestamp_seconds >= 0),
  captured_at timestamptz,
  moment_id uuid references public.sermon_moments (id) on delete set null,
  client_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.terms (
  id uuid primary key default gen_random_uuid(),
  sermon_id uuid not null references public.sermons (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  pack_artifact_id uuid references public.ai_artifacts (id) on delete set null,
  origin public.item_origin not null default 'ai',
  user_edited boolean not null default false,
  hidden boolean not null default false,
  position integer not null default 0,
  term text not null check (char_length(term) <= 200),
  definition text not null default '',
  context text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.review_items (
  id uuid primary key default gen_random_uuid(),
  sermon_id uuid not null references public.sermons (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  pack_artifact_id uuid references public.ai_artifacts (id) on delete set null,
  origin public.item_origin not null default 'ai',
  position integer not null default 0,
  kind public.review_kind not null,
  prompt text not null check (char_length(prompt) <= 1000),
  detail text not null default '',
  status public.review_status not null default 'new',
  due_on date,
  last_reviewed_at timestamptz,
  times_reviewed integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Polymorphic evidence links: (subject item) → (source + locator).
create table public.source_citations (
  id uuid primary key default gen_random_uuid(),
  sermon_id uuid not null references public.sermons (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_type text not null check (subject_type in (
    'sermon', 'main_idea', 'section', 'moment', 'scripture', 'quote', 'illustration',
    'application', 'question', 'term', 'review_item', 'chat_message', 'study_guide'
  )),
  subject_id uuid not null,
  -- Sub-part of the subject (e.g. a study-guide section key).
  subject_part text,
  source_id uuid not null references public.sermon_sources (id) on delete cascade,
  source_key text,
  note_block_id text,
  timestamp_start double precision,
  timestamp_end double precision,
  page integer,
  excerpt text check (excerpt is null or char_length(excerpt) <= 600),
  confidence public.confidence_level,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index source_citations_subject_idx on public.source_citations (subject_type, subject_id);
create index source_citations_source_idx on public.source_citations (source_id);
create index source_citations_sermon_idx on public.source_citations (sermon_id);

-- Indexes & triggers for pack tables
do $$
declare t text;
begin
  foreach t in array array['main_ideas', 'sermon_sections', 'sermon_moments', 'scripture_references',
    'quotes', 'illustrations', 'applications', 'questions', 'terms', 'review_items']
  loop
    execute format('create index %I on public.%I (sermon_id, position)', t || '_sermon_idx', t);
    execute format('create index %I on public.%I (user_id)', t || '_user_idx', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || ': owner read', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || ': owner update', t);
  end loop;
end
$$;
create index scripture_osis_idx on public.scripture_references (user_id, book, chapter_start);
create index review_items_status_idx on public.review_items (user_id, status, due_on);
create index questions_status_idx on public.questions (user_id, status);
create index applications_status_idx on public.applications (user_id, status);
create index main_ideas_search_idx on public.main_ideas using gin (search_tsv);
create index quotes_search_idx on public.quotes using gin (search_tsv);

-- Column-level update grants: users may correct content/timestamps/state, never provenance.
grant update (title, summary, explanation, timestamp_start, timestamp_end, hidden, user_edited)
  on public.main_ideas to authenticated;
grant update (title, summary, timestamp_start, timestamp_end, hidden, user_edited)
  on public.sermon_sections to authenticated;
grant update (title, description, timestamp_start, timestamp_end, timestamp_source, verification_status, original_timestamp_start, hidden, user_edited)
  on public.sermon_moments to authenticated;
grant update (reference_text, normalized_reference, osis, book, chapter_start, verse_start, chapter_end, verse_end, timestamp_start, hidden, user_edited, role)
  on public.scripture_references to authenticated;
grant update (hidden, user_edited, timestamp_start) on public.quotes to authenticated;
grant update (title, summary, hidden, user_edited, timestamp_start, timestamp_end)
  on public.illustrations to authenticated;
grant update (text, detail, status, completed_at, hidden, user_edited) on public.applications to authenticated;
grant update (text, status, answer, answered_at, for_group, hidden, user_edited) on public.questions to authenticated;
grant update (definition, hidden, user_edited) on public.terms to authenticated;
grant update (status, due_on, last_reviewed_at, times_reviewed) on public.review_items to authenticated;

-- User-created items (captures, manual Scripture, own applications/questions).
grant insert (sermon_id, category, title, description, timestamp_start, timestamp_end, timestamp_source, captured_at, client_id, origin, verification_status)
  on public.sermon_moments to authenticated;
grant insert (sermon_id, reference_text, normalized_reference, osis, book, chapter_start, verse_start, chapter_end, verse_end, kind, confidence, role, timestamp_start, client_id, origin)
  on public.scripture_references to authenticated;
grant insert (sermon_id, text, detail, origin) on public.applications to authenticated;
grant insert (sermon_id, text, timestamp_seconds, captured_at, moment_id, client_id, origin, for_group)
  on public.questions to authenticated;
grant delete on public.sermon_moments, public.scripture_references, public.applications, public.questions to authenticated;

create policy "sermon_moments: owner insert user items" on public.sermon_moments
  for insert to authenticated
  with check (user_id = (select auth.uid()) and origin = 'user' and public.owns_sermon(sermon_id)
    and category in ('BOOKMARK', 'IMPORTANT', 'QUESTION', 'SCRIPTURE'));
create policy "sermon_moments: owner delete user items" on public.sermon_moments
  for delete to authenticated using (user_id = (select auth.uid()) and origin = 'user');
create policy "scripture: owner insert user items" on public.scripture_references
  for insert to authenticated
  with check (user_id = (select auth.uid()) and origin = 'user' and public.owns_sermon(sermon_id));
create policy "scripture: owner delete user items" on public.scripture_references
  for delete to authenticated using (user_id = (select auth.uid()) and origin = 'user');
create policy "applications: owner insert user items" on public.applications
  for insert to authenticated
  with check (user_id = (select auth.uid()) and origin = 'user' and public.owns_sermon(sermon_id));
create policy "applications: owner delete user items" on public.applications
  for delete to authenticated using (user_id = (select auth.uid()) and origin = 'user');
create policy "questions: owner insert user items" on public.questions
  for insert to authenticated
  with check (user_id = (select auth.uid()) and origin = 'user' and public.owns_sermon(sermon_id));
create policy "questions: owner delete user items" on public.questions
  for delete to authenticated using (user_id = (select auth.uid()) and origin = 'user');

alter table public.ai_artifacts enable row level security;
alter table public.source_citations enable row level security;
revoke all on public.ai_artifacts, public.source_citations from anon, authenticated;
grant select on public.ai_artifacts, public.source_citations to authenticated;
create policy "ai_artifacts: owner read" on public.ai_artifacts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "source_citations: owner read" on public.source_citations
  for select to authenticated using (user_id = (select auth.uid()));
