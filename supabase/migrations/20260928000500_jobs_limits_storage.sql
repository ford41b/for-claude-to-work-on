-- Durable job queue, rate limits, storage buckets and object policies.

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  sermon_id uuid references public.sermons (id) on delete cascade,
  source_id uuid references public.sermon_sources (id) on delete cascade,
  type public.job_type not null,
  status public.job_status not null default 'queued',
  priority integer not null default 100,
  stage text,
  progress integer not null default 0 check (progress between 0 and 100),
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  attempt_count integer not null default 0,
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  run_after timestamptz not null default now(),
  locked_by text,
  locked_until timestamptz,
  last_error text,
  error_code text,
  started_at timestamptz,
  completed_at timestamptz,
  provider text,
  model text,
  prompt_version text,
  usage jsonb not null default '{}'::jsonb,
  dedupe_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index jobs_dedupe_active_idx on public.jobs (dedupe_key)
  where dedupe_key is not null and status in ('queued', 'running');
create index jobs_claim_idx on public.jobs (priority, run_after) where status = 'queued';
create index jobs_lease_idx on public.jobs (locked_until) where status = 'running';
create index jobs_sermon_idx on public.jobs (sermon_id, created_at desc);
create index jobs_user_idx on public.jobs (user_id);
create trigger jobs_updated_at before update on public.jobs
  for each row execute function public.set_updated_at();

alter table public.jobs enable row level security;
revoke all on public.jobs from anon, authenticated;
grant select on public.jobs to authenticated;
create policy "jobs: owner read" on public.jobs
  for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Rate limiting (fixed windows per user + bucket)
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (user_id, bucket, window_start)
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- Consumes one unit from the caller's bucket. Returns true when the call is allowed.
create or replace function public.consume_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_window timestamptz;
  v_count integer;
begin
  if v_uid is null then
    return false;
  end if;
  if p_window_seconds <= 0 or p_limit <= 0 then
    raise exception 'invalid rate limit' using errcode = '22023';
  end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limits as r (user_id, bucket, window_start, count)
    values (v_uid, left(p_bucket, 64), v_window, 1)
  on conflict (user_id, bucket, window_start) do update set count = r.count + 1
  returning count into v_count;
  -- Opportunistic cleanup of this user's old windows.
  delete from public.rate_limits
   where user_id = v_uid and window_start < now() - interval '2 days';
  return v_count <= p_limit;
end;
$$;
revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.consume_rate_limit(text, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private buckets with MIME allowlists and size caps.
-- Object paths: <user_id>/<sermon_id>/<media_file_id>/<filename>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('photos', 'photos', false, 31457280,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif']),
  ('media', 'media', false, 2147483648,
    array['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac',
          'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/ogg', 'audio/webm', 'audio/flac',
          'video/mp4', 'video/quicktime', 'video/webm', 'video/mpeg']),
  ('documents', 'documents', false, 52428800,
    array['application/pdf', 'text/plain', 'text/markdown']),
  ('derived', 'derived', false, 10485760,
    array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "storage: owner read" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('photos', 'media', 'documents', 'derived')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "storage: owner upload originals" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('photos', 'media', 'documents')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "storage: owner update originals" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('photos', 'media', 'documents')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id in ('photos', 'media', 'documents')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "storage: owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('photos', 'media', 'documents', 'derived')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
