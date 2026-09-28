-- Sermons, the provenance registry (sermon_sources), stored files, and per-type source tables.

create table public.sermons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 300),
  speaker text check (speaker is null or char_length(speaker) <= 200),
  church text check (church is null or char_length(church) <= 200),
  series text check (series is null or char_length(series) <= 200),
  preached_on date,
  status public.sermon_status not null default 'draft',
  finished_at timestamptz,
  -- Fields the user typed or corrected. Metadata providers and AI never overwrite these.
  corrected_fields text[] not null default '{}'
    check (corrected_fields <@ array['title', 'speaker', 'church', 'series', 'preached_on']::text[]),
  -- Values suggested by metadata providers / AI for fields the user already set.
  metadata_suggestions jsonb not null default '{}'::jsonb,
  -- Denormalized from the current Sermon Pack for fast library rendering and search.
  current_pack_id uuid,
  big_idea text,
  central_thesis text,
  short_summary text,
  detailed_summary text,
  pack_stale boolean not null default false,
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_tsv tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(speaker, '') || ' ' || coalesce(church, '') || ' ' || coalesce(series, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(big_idea, '') || ' ' || coalesce(central_thesis, '') || ' ' || coalesce(short_summary, '')), 'C')
  ) stored
);

create index sermons_user_updated_idx on public.sermons (user_id, updated_at desc);
create index sermons_user_preached_idx on public.sermons (user_id, preached_on desc nulls last);
create index sermons_search_idx on public.sermons using gin (search_tsv);
create index sermons_title_trgm_idx on public.sermons using gin (title extensions.gin_trgm_ops);
create index sermons_speaker_trgm_idx on public.sermons using gin (speaker extensions.gin_trgm_ops);
create trigger sermons_updated_at before update on public.sermons
  for each row execute function public.set_updated_at();

-- True when the sermon exists and belongs to the calling user. Used in insert policies of
-- child tables so a user cannot attach rows to someone else's sermon.
create or replace function public.owns_sermon(p_sermon_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.sermons s
    where s.id = p_sermon_id and s.user_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- Provenance registry: one row per evidence source in a notebook.
-- ---------------------------------------------------------------------------
create table public.sermon_sources (
  id uuid primary key default gen_random_uuid(),
  sermon_id uuid not null references public.sermons (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  source_type public.source_type not null,
  label text not null check (char_length(label) <= 120),
  ordinal integer not null default 1 check (ordinal > 0),
  status public.source_status not null default 'ready',
  content_hash text,
  error_code text,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sermon_id, source_type, ordinal)
);
create index sermon_sources_sermon_idx on public.sermon_sources (sermon_id, source_type);
create index sermon_sources_user_idx on public.sermon_sources (user_id);
create trigger sermon_sources_updated_at before update on public.sermon_sources
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Every stored object (originals and derived renditions).
-- ---------------------------------------------------------------------------
create table public.media_files (
  id uuid primary key default gen_random_uuid(),
  sermon_id uuid not null references public.sermons (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  source_id uuid references public.sermon_sources (id) on delete cascade,
  kind public.media_kind not null,
  bucket text not null check (bucket in ('photos', 'media', 'documents', 'derived')),
  path text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  sha256 text,
  original_filename text check (original_filename is null or char_length(original_filename) <= 255),
  status public.media_status not null default 'pending',
  rejection_reason text,
  width integer,
  height integer,
  duration_seconds double precision,
  -- Uploaders of audio/video confirm they have the right to process the recording.
  rights_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  unique (bucket, path),
  check (kind not in ('audio', 'video') or rights_confirmed_at is not null)
);
create index media_files_sermon_idx on public.media_files (sermon_id);
create index media_files_source_idx on public.media_files (source_id);
create index media_files_user_idx on public.media_files (user_id);

-- ---------------------------------------------------------------------------
-- Per-type source tables (1:1 with sermon_sources)
-- ---------------------------------------------------------------------------
create table public.video_sources (
  source_id uuid primary key references public.sermon_sources (id) on delete cascade,
  sermon_id uuid not null references public.sermons (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  origin text not null check (origin in ('youtube', 'upload')),
  youtube_video_id text check (youtube_video_id is null or youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),
  original_url text check (original_url is null or char_length(original_url) <= 2048),
  media_file_id uuid references public.media_files (id) on delete set null,
  title text,
  channel_title text,
  thumbnail_url text,
  published_at timestamptz,
  duration_seconds double precision,
  privacy_status text not null default 'unknown'
    check (privacy_status in ('public', 'unlisted', 'private', 'unknown')),
  embeddable boolean,
  live_status text not null default 'unknown' check (live_status in ('none', 'live', 'upcoming', 'unknown')),
  age_restricted boolean,
  metadata_provider text check (metadata_provider in ('youtube_data_api', 'oembed', 'none')),
  metadata_fetched_at timestamptz,
  check (origin <> 'youtube' or youtube_video_id is not null)
);
create index video_sources_sermon_idx on public.video_sources (sermon_id);

create table public.audio_sources (
  source_id uuid primary key references public.sermon_sources (id) on delete cascade,
  sermon_id uuid not null references public.sermons (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  media_file_id uuid references public.media_files (id) on delete set null,
  duration_seconds double precision
);
create index audio_sources_sermon_idx on public.audio_sources (sermon_id);

create table public.photos (
  source_id uuid primary key references public.sermon_sources (id) on delete cascade,
  sermon_id uuid not null references public.sermons (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  original_file_id uuid not null references public.media_files (id) on delete cascade,
  preview_file_id uuid references public.media_files (id) on delete set null,
  width integer,
  height integer,
  captured_at timestamptz,
  -- Playback position when the photo was taken, if a sermon player was active.
  sermon_timestamp_seconds double precision check (sermon_timestamp_seconds is null or sermon_timestamp_seconds >= 0),
  caption text check (caption is null or char_length(caption) <= 500),
  current_ocr_id uuid
);
create index photos_sermon_idx on public.photos (sermon_id);

create table public.ocr_extractions (
  id uuid primary key default gen_random_uuid(),
  photo_source_id uuid not null references public.photos (source_id) on delete cascade,
  sermon_id uuid not null references public.sermons (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  version integer not null check (version > 0),
  origin public.item_origin not null,
  is_current boolean not null default false,
  photo_kind text check (photo_kind in ('slide', 'handwriting', 'handout', 'screenshot', 'bulletin', 'whiteboard', 'other')),
  title text,
  full_text text not null default '',
  -- [{ "type": "heading|paragraph|list_item|scripture|diagram|other", "text": "...",
  --    "confidence": "high|medium|low", "unclear": false }]
  blocks jsonb not null default '[]'::jsonb,
  overall_confidence public.confidence_level,
  legibility_note text,
  artifact_id uuid,
  created_at timestamptz not null default now(),
  search_tsv tsvector generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || full_text)
  ) stored,
  unique (photo_source_id, version)
);
create unique index ocr_one_current_idx on public.ocr_extractions (photo_source_id) where is_current;
create index ocr_sermon_idx on public.ocr_extractions (sermon_id);
create index ocr_search_idx on public.ocr_extractions using gin (search_tsv);
alter table public.photos
  add constraint photos_current_ocr_fk foreign key (current_ocr_id)
  references public.ocr_extractions (id) on delete set null;

create table public.documents (
  source_id uuid primary key references public.sermon_sources (id) on delete cascade,
  sermon_id uuid not null references public.sermons (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  media_file_id uuid references public.media_files (id) on delete set null,
  title text,
  page_count integer,
  -- [{ "page": 1, "text": "...", "headings": ["..."] }]
  pages jsonb not null default '[]'::jsonb,
  extracted_text text not null default '',
  search_tsv tsvector generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || extracted_text)
  ) stored
);
create index documents_sermon_idx on public.documents (sermon_id);
create index documents_search_idx on public.documents using gin (search_tsv);

-- ---------------------------------------------------------------------------
-- Notes (ProseMirror JSON) and derived, citable blocks
-- ---------------------------------------------------------------------------
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null unique references public.sermon_sources (id) on delete cascade,
  sermon_id uuid not null references public.sermons (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Notes' check (char_length(title) <= 200),
  content jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  plain_text text not null default '',
  version integer not null default 1,
  content_hash text,
  client_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_tsv tsvector generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || plain_text)
  ) stored
);
create index notes_sermon_idx on public.notes (sermon_id);
create index notes_search_idx on public.notes using gin (search_tsv);
create trigger notes_updated_at before update on public.notes
  for each row execute function public.set_updated_at();

create table public.note_blocks (
  note_id uuid not null references public.notes (id) on delete cascade,
  block_id text not null check (char_length(block_id) between 1 and 64),
  sermon_id uuid not null references public.sermons (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  position integer not null,
  block_type text not null,
  text text not null,
  timestamp_seconds double precision,
  content_hash text not null,
  primary key (note_id, block_id)
);
create index note_blocks_sermon_idx on public.note_blocks (sermon_id);

-- ---------------------------------------------------------------------------
-- RLS & grants
-- ---------------------------------------------------------------------------
alter table public.sermons enable row level security;
alter table public.sermon_sources enable row level security;
alter table public.media_files enable row level security;
alter table public.video_sources enable row level security;
alter table public.audio_sources enable row level security;
alter table public.photos enable row level security;
alter table public.ocr_extractions enable row level security;
alter table public.documents enable row level security;
alter table public.notes enable row level security;
alter table public.note_blocks enable row level security;

revoke all on public.sermons, public.sermon_sources, public.media_files, public.video_sources,
  public.audio_sources, public.photos, public.ocr_extractions, public.documents, public.notes,
  public.note_blocks from anon, authenticated;

grant select, delete on public.sermons to authenticated;
grant insert (title, speaker, church, series, preached_on, corrected_fields) on public.sermons to authenticated;
grant update (title, speaker, church, series, preached_on, corrected_fields, last_opened_at)
  on public.sermons to authenticated;
grant select on public.sermon_sources, public.media_files, public.video_sources,
  public.audio_sources, public.ocr_extractions, public.documents, public.notes,
  public.note_blocks to authenticated;
grant select on public.photos to authenticated;
grant update (caption, sermon_timestamp_seconds) on public.photos to authenticated;

create policy "sermons: owner read" on public.sermons
  for select to authenticated using (user_id = (select auth.uid()));
create policy "sermons: owner insert" on public.sermons
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "sermons: owner update" on public.sermons
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "sermons: owner delete" on public.sermons
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "sermon_sources: owner read" on public.sermon_sources
  for select to authenticated using (user_id = (select auth.uid()));
create policy "media_files: owner read" on public.media_files
  for select to authenticated using (user_id = (select auth.uid()));
create policy "video_sources: owner read" on public.video_sources
  for select to authenticated using (user_id = (select auth.uid()));
create policy "audio_sources: owner read" on public.audio_sources
  for select to authenticated using (user_id = (select auth.uid()));
create policy "photos: owner read" on public.photos
  for select to authenticated using (user_id = (select auth.uid()));
create policy "photos: owner update" on public.photos
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "ocr: owner read" on public.ocr_extractions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "documents: owner read" on public.documents
  for select to authenticated using (user_id = (select auth.uid()));
create policy "notes: owner read" on public.notes
  for select to authenticated using (user_id = (select auth.uid()));
create policy "note_blocks: owner read" on public.note_blocks
  for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Note RPCs (security definer with explicit ownership checks; atomic)
-- ---------------------------------------------------------------------------

-- Creates a USER_NOTE source and its note in one transaction.
create or replace function public.create_note(p_sermon_id uuid, p_title text default 'Notes')
returns public.notes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_source_id uuid;
  v_ordinal integer;
  v_note public.notes;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  perform 1 from public.sermons where id = p_sermon_id and user_id = v_uid for update;
  if not found then
    raise exception 'sermon not found' using errcode = 'P0002';
  end if;
  select coalesce(max(ordinal), 0) + 1 into v_ordinal
    from public.sermon_sources where sermon_id = p_sermon_id and source_type = 'USER_NOTE';
  insert into public.sermon_sources (sermon_id, user_id, source_type, label, ordinal, status)
    values (
      p_sermon_id, v_uid, 'USER_NOTE',
      case when v_ordinal = 1 then 'Your notes' else 'Your notes ' || v_ordinal end,
      v_ordinal, 'ready'
    )
    returning id into v_source_id;
  insert into public.notes (source_id, sermon_id, user_id, title)
    values (v_source_id, p_sermon_id, v_uid, left(coalesce(nullif(trim(p_title), ''), 'Notes'), 200))
    returning * into v_note;
  return v_note;
end;
$$;

-- Saves a note with optimistic concurrency. Returns status 'saved' with the new version, or
-- 'conflict' with the current server version (the caller keeps both copies; nothing is lost).
create or replace function public.save_note(
  p_note_id uuid,
  p_base_version integer,
  p_title text,
  p_content jsonb,
  p_plain_text text,
  p_content_hash text,
  p_blocks jsonb,
  p_client_updated_at timestamptz
)
returns table (status text, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_note public.notes;
  v_new_version integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select * into v_note from public.notes n where n.id = p_note_id and n.user_id = v_uid for update;
  if not found then
    raise exception 'note not found' using errcode = 'P0002';
  end if;
  if v_note.version <> p_base_version then
    return query select 'conflict'::text, v_note.version;
    return;
  end if;
  if pg_column_size(p_content) > 2000000 then
    raise exception 'note too large' using errcode = '22023';
  end if;

  update public.notes n
     set title = left(coalesce(nullif(trim(p_title), ''), 'Notes'), 200),
         content = p_content,
         plain_text = p_plain_text,
         content_hash = p_content_hash,
         client_updated_at = p_client_updated_at,
         version = n.version + 1
   where n.id = p_note_id
   returning n.version into v_new_version;

  delete from public.note_blocks b
   where b.note_id = p_note_id
     and b.block_id not in (select x ->> 'block_id' from jsonb_array_elements(p_blocks) x);

  insert into public.note_blocks (note_id, block_id, sermon_id, user_id, position, block_type, text, timestamp_seconds, content_hash)
  select p_note_id,
         x ->> 'block_id',
         v_note.sermon_id,
         v_uid,
         (x ->> 'position')::integer,
         x ->> 'block_type',
         x ->> 'text',
         nullif(x ->> 'timestamp_seconds', '')::double precision,
         x ->> 'content_hash'
    from jsonb_array_elements(p_blocks) x
  on conflict (note_id, block_id) do update
     set position = excluded.position,
         block_type = excluded.block_type,
         text = excluded.text,
         timestamp_seconds = excluded.timestamp_seconds,
         content_hash = excluded.content_hash;

  update public.sermon_sources s
     set content_hash = p_content_hash
   where s.id = v_note.source_id;

  -- Notes edited after a pack exists make the pack stale (a debounced rebuild is scheduled
  -- by the API layer).
  update public.sermons s
     set pack_stale = true
   where s.id = v_note.sermon_id and s.current_pack_id is not null;

  return query select 'saved'::text, v_new_version;
end;
$$;

revoke all on function public.create_note(uuid, text) from public, anon;
revoke all on function public.save_note(uuid, integer, text, jsonb, text, text, jsonb, timestamptz) from public, anon;
grant execute on function public.create_note(uuid, text) to authenticated;
grant execute on function public.save_note(uuid, integer, text, jsonb, text, text, jsonb, timestamptz) to authenticated;
