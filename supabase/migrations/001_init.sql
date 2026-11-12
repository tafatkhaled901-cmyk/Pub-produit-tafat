-- Pub Produit : schéma initial
-- À exécuter une fois dans Supabase (SQL Editor) ou via `supabase db push`.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  credits integer not null default 3 check (credits >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.video_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 'full' : nouvelle vidéo (clips IA générés, 1 crédit)
  -- 'remix' : retouche musique/ton, réutilise les clips du job source (gratuit)
  kind text not null default 'full' check (kind in ('full', 'remix')),
  source_job_id uuid references public.video_jobs (id) on delete cascade,
  photo_path text not null,
  tone text not null check (tone in ('dynamique', 'professionnel', 'humoristique')),
  language text not null check (language in ('fr', 'es')),
  music integer not null default 1 check (music between 1 and 3),
  status text not null default 'queued'
    check (status in ('queued', 'analyzing', 'clips', 'editing', 'done', 'failed')),
  error text,
  analysis jsonb,
  video_path text,
  thumb_path text,
  attempts integer not null default 0,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists video_jobs_user_idx on public.video_jobs (user_id, created_at desc);
create index if not exists video_jobs_queue_idx on public.video_jobs (status, created_at);

create table if not exists public.credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid references public.video_jobs (id) on delete set null,
  delta integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Sécurité : un utilisateur ne lit que ses propres lignes.
-- Toutes les écritures passent par le backend (clé service_role).
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.video_jobs enable row level security;
alter table public.credit_ledger enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists "video_jobs_select_own" on public.video_jobs;
create policy "video_jobs_select_own" on public.video_jobs
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "credit_ledger_select_own" on public.credit_ledger;
create policy "credit_ledger_select_own" on public.credit_ledger
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Profil créé automatiquement à l'inscription (3 crédits offerts)
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  insert into public.credit_ledger (user_id, delta, reason) values (new.id, 3, 'welcome');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- updated_at automatique
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists video_jobs_touch on public.video_jobs;
create trigger video_jobs_touch
  before update on public.video_jobs
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Fonctions appelées par le backend uniquement
-- ---------------------------------------------------------------------------

-- Débite un crédit et crée le job, de façon atomique.
create or replace function public.create_video_job(
  p_user uuid,
  p_photo text,
  p_tone text,
  p_language text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job uuid;
begin
  update public.profiles set credits = credits - 1
    where id = p_user and credits > 0;
  if not found then
    raise exception 'NO_CREDITS';
  end if;

  insert into public.video_jobs (user_id, photo_path, tone, language)
    values (p_user, p_photo, p_tone, p_language)
    returning id into v_job;

  insert into public.credit_ledger (user_id, job_id, delta, reason)
    values (p_user, v_job, -1, 'video');

  return v_job;
end;
$$;

-- Rend le crédit d'un job en échec. Sans effet si déjà remboursé.
create or replace function public.refund_video_job(p_job uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_kind text;
begin
  select user_id, kind into v_user, v_kind
    from public.video_jobs where id = p_job for update;
  if v_user is null or v_kind <> 'full' then
    return;
  end if;
  if exists (
    select 1 from public.credit_ledger where job_id = p_job and reason = 'refund'
  ) then
    return;
  end if;
  update public.profiles set credits = credits + 1 where id = v_user;
  insert into public.credit_ledger (user_id, job_id, delta, reason)
    values (v_user, p_job, 1, 'refund');
end;
$$;

-- Le worker réserve le prochain job. Un job bloqué depuis plus de 15 minutes
-- (worker planté) est repris une fois.
create or replace function public.claim_video_job()
returns setof public.video_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.video_jobs j
    set status = 'analyzing',
        locked_at = now(),
        attempts = j.attempts + 1,
        error = null
    where j.id = (
      select c.id from public.video_jobs c
      where c.status = 'queued'
         or (
           c.status in ('analyzing', 'clips', 'editing')
           and c.locked_at < now() - interval '15 minutes'
           and c.attempts < 2
         )
      order by c.created_at
      for update skip locked
      limit 1
    )
    returning j.*;
end;
$$;

-- Jobs bloqués qui ont déjà été repris : à marquer en échec par le worker.
create or replace function public.stale_video_jobs()
returns setof public.video_jobs
language sql
security definer
set search_path = public
as $$
  select * from public.video_jobs
  where status in ('analyzing', 'clips', 'editing')
    and locked_at < now() - interval '15 minutes'
    and attempts >= 2;
$$;

revoke all on function public.create_video_job(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.refund_video_job(uuid) from public, anon, authenticated;
revoke all on function public.claim_video_job() from public, anon, authenticated;
revoke all on function public.stale_video_jobs() from public, anon, authenticated;
grant execute on function public.create_video_job(uuid, text, text, text) to service_role;
grant execute on function public.refund_video_job(uuid) to service_role;
grant execute on function public.claim_video_job() to service_role;
grant execute on function public.stale_video_jobs() to service_role;

-- ---------------------------------------------------------------------------
-- Temps réel : l'app suit la progression de ses jobs
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'video_jobs'
  ) then
    alter publication supabase_realtime add table public.video_jobs;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Stockage : un seul bucket privé. Aucun accès direct depuis l'app :
-- envoi par URL signée, lecture par URL signée, les deux délivrées par l'API.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
  values ('media', 'media', false)
  on conflict (id) do nothing;
