-- Run this in Supabase SQL editor for project jonleevqitklxzzdhoye.
-- Tracks every Colin Writer generation so the training dashboard can show
-- voice-fidelity progress over time.

create table if not exists public.colin_training_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  topic text not null,
  persona text not null default 'colin',
  genre text,
  word_count int not null,
  text_style_score int not null,
  colin_phrases_found int not null default 0,
  generic_phrases_found int not null default 0,
  starts_with_hook boolean not null default false,
  has_cultural_ref boolean not null default false,
  -- Strip diagnostics from lib/colin-strip.ts
  dropped_sentence_count int not null default 0,
  prefix_stripped_count int not null default 0,
  raw_word_count int,
  -- Free-form metadata for future analysis (e.g., generator version, commit sha)
  metadata jsonb
);

create index if not exists colin_training_runs_created_at_idx
  on public.colin_training_runs (created_at desc);

create index if not exists colin_training_runs_persona_idx
  on public.colin_training_runs (persona, created_at desc);

create index if not exists colin_training_runs_genre_idx
  on public.colin_training_runs (genre, created_at desc);

-- Row-level security: allow inserts + selects via anon key (this app is internal).
alter table public.colin_training_runs enable row level security;

drop policy if exists "anon insert training runs" on public.colin_training_runs;
create policy "anon insert training runs"
  on public.colin_training_runs for insert
  to anon
  with check (true);

drop policy if exists "anon read training runs" on public.colin_training_runs;
create policy "anon read training runs"
  on public.colin_training_runs for select
  to anon
  using (true);

drop policy if exists "anon update training runs" on public.colin_training_runs;
create policy "anon update training runs"
  on public.colin_training_runs for update
  to anon
  using (true)
  with check (true);
