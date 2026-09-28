-- Foundation: extensions, enums, helpers, profiles, settings.
-- Conventions:
--   * every user-owned table carries user_id for single-equality RLS policies
--   * anon has no table privileges; authenticated gets explicit, minimal grants
--   * system-written tables are read-only to users (the worker writes with a privileged role)

create extension if not exists vector with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.source_type as enum (
  'SERMON_VIDEO', 'UPLOADED_VIDEO', 'UPLOADED_AUDIO', 'USER_NOTE', 'PHOTO',
  'OCR_EXTRACTION', 'DOCUMENT', 'BIBLE_SOURCE', 'AI_GENERATED', 'EXTERNAL_REFERENCE'
);
create type public.source_status as enum (
  'pending_upload', 'ready', 'processing', 'processed', 'failed', 'unavailable'
);
create type public.confidence_level as enum ('high', 'medium', 'low');
create type public.item_origin as enum ('ai', 'user');
create type public.sermon_status as enum ('draft', 'finished');
create type public.moment_category as enum (
  'INTRODUCTION', 'CONTEXT', 'MAIN_POINT', 'SCRIPTURE', 'ILLUSTRATION', 'QUOTE',
  'QUESTION', 'APPLICATION', 'PRAYER', 'CONCLUSION', 'BOOKMARK', 'IMPORTANT'
);
create type public.timestamp_source as enum ('ai', 'user_capture', 'user_correction');
create type public.verification_status as enum ('unverified', 'user_verified', 'user_corrected');
create type public.quote_type as enum ('VERBATIM_QUOTE', 'PARAPHRASE');
create type public.scripture_kind as enum ('explicit', 'spoken', 'inferred', 'allusion');
create type public.media_kind as enum ('photo', 'audio', 'video', 'document', 'photo_preview');
create type public.media_status as enum ('pending', 'uploaded', 'verified', 'rejected');
create type public.artifact_type as enum (
  'VIDEO_ANALYSIS', 'AUDIO_ANALYSIS', 'PHOTO_ANALYSIS', 'DOCUMENT_ANALYSIS', 'SERMON_PACK',
  'BIBLE_STUDY', 'ANSWER', 'SUMMARY', 'OUTLINE', 'QUIZ', 'FLASHCARDS', 'REVIEW',
  'AUDIO_SCRIPT', 'VIDEO_SCRIPT'
);
create type public.artifact_status as enum ('building', 'ready', 'failed', 'superseded');
create type public.job_type as enum (
  'INGEST_SERMON', 'ANALYZE_VIDEO', 'ANALYZE_AUDIO', 'PROCESS_PHOTO', 'PROCESS_DOCUMENT',
  'EXTRACT_SCRIPTURE', 'BUILD_SERMON_PACK', 'CREATE_EMBEDDINGS', 'GENERATE_STUDY',
  'GENERATE_FLASHCARDS', 'GENERATE_QUIZ', 'GENERATE_AUDIO_RECAP', 'GENERATE_VIDEO_RECAP'
);
create type public.job_status as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled');
create type public.review_kind as enum (
  'remember', 'scripture', 'question', 'key_idea', 'application', 'confusing'
);
create type public.review_status as enum ('new', 'reviewed', 'saved', 'review_again', 'hidden');
create type public.application_status as enum ('open', 'completed', 'archived');
create type public.question_status as enum ('open', 'answered');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles & settings
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  bible_translation text check (bible_translation is null or char_length(bible_translation) <= 64),
  ai_processing_acknowledged_at timestamptz,
  weekly_review_enabled boolean not null default false,
  text_size text not null default 'default'
    check (text_size in ('small', 'default', 'large', 'xlarge')),
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger user_settings_updated_at before update on public.user_settings
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 80), '')
  )
  on conflict (id) do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;

revoke all on public.profiles, public.user_settings from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select on public.user_settings to authenticated;
grant update (bible_translation, ai_processing_acknowledged_at, weekly_review_enabled, text_size, theme)
  on public.user_settings to authenticated;

create policy "profiles: owner can read" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: owner can update" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "settings: owner can read" on public.user_settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy "settings: owner can update" on public.user_settings
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
