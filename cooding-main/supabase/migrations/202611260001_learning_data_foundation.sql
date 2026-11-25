-- Learning data foundation: richer attempts, deduplicated mistakes, lesson timing,
-- custom-lesson publishing states, and saved playground projects.
-- Additive only. Safe to re-run; existing student data is preserved.

alter table public.lesson_progress
  add column if not exists last_opened_at timestamptz,
  add column if not exists time_spent_seconds integer not null default 0 check (time_spent_seconds >= 0);

alter table public.coding_attempts
  add column if not exists exercise_ref text check (char_length(exercise_ref) <= 120),
  add column if not exists lesson_ref text check (char_length(lesson_ref) <= 120),
  add column if not exists duration_seconds integer check (duration_seconds >= 0),
  add column if not exists hints_used integer not null default 0 check (hints_used >= 0),
  add column if not exists test_results jsonb not null default '[]'::jsonb;

alter table public.error_history
  add column if not exists language text check (char_length(language) <= 40),
  add column if not exists lesson_ref text check (char_length(lesson_ref) <= 120),
  add column if not exists exercise_ref text check (char_length(exercise_ref) <= 120),
  add column if not exists code_excerpt text,
  add column if not exists suggested_fix text,
  add column if not exists ai_explanation text,
  add column if not exists occurrences integer not null default 1 check (occurrences >= 1),
  add column if not exists last_seen_at timestamptz not null default now();

alter table public.custom_lessons
  add column if not exists status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  add column if not exists objectives jsonb not null default '[]'::jsonb,
  add column if not exists quiz jsonb,
  add column if not exists test_cases jsonb not null default '[]'::jsonb,
  add column if not exists hints jsonb not null default '[]'::jsonb;

create index if not exists custom_lessons_status_created_idx on public.custom_lessons (status, created_at desc);
create index if not exists error_history_user_open_seen_idx on public.error_history (user_id, resolved, last_seen_at desc);

-- Drafts and archived lessons become private to their owner; published lessons stay shared.
drop policy if exists "Anyone reads shared custom lessons" on public.custom_lessons;
drop policy if exists "Learners read published or own custom lessons" on public.custom_lessons;
create policy "Learners read published or own custom lessons" on public.custom_lessons
for select to anon, authenticated
using (status = 'published' or (select auth.uid()) = owner_id);

create table if not exists public.playground_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  files jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists playground_projects_user_updated_idx on public.playground_projects (user_id, updated_at desc);

drop trigger if exists playground_projects_updated_at on public.playground_projects;
create trigger playground_projects_updated_at before update on public.playground_projects
for each row execute function public.set_updated_at();

alter table public.playground_projects enable row level security;

grant select, insert, update, delete on public.playground_projects to authenticated;

drop policy if exists "Students manage their playground projects" on public.playground_projects;
create policy "Students manage their playground projects" on public.playground_projects
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
