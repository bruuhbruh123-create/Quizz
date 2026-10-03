-- MES QCM V2 — configuration Supabase
-- À exécuter dans Supabase > SQL Editor.
-- Cette base utilise Supabase Auth + Row Level Security (RLS).
-- Ne mets jamais une service_role key dans le site.

create table if not exists public.quizzes (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quiz_id text,
  quiz_name text not null,
  score integer not null,
  total integer not null,
  answers jsonb,
  created_at timestamptz not null default now()
);

alter table public.quizzes enable row level security;
alter table public.results enable row level security;

drop policy if exists "Users can read own quizzes" on public.quizzes;
drop policy if exists "Users can insert own quizzes" on public.quizzes;
drop policy if exists "Users can update own quizzes" on public.quizzes;
drop policy if exists "Users can delete own quizzes" on public.quizzes;

create policy "Users can read own quizzes"
on public.quizzes for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert own quizzes"
on public.quizzes for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own quizzes"
on public.quizzes for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete own quizzes"
on public.quizzes for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can read own results" on public.results;
drop policy if exists "Users can insert own results" on public.results;
drop policy if exists "Users can delete own results" on public.results;

create policy "Users can read own results"
on public.results for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert own results"
on public.results for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can delete own results"
on public.results for delete to authenticated
using ((select auth.uid()) = user_id);

create index if not exists quizzes_user_id_idx on public.quizzes(user_id);
create index if not exists results_user_id_idx on public.results(user_id);
