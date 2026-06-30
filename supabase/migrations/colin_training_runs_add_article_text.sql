-- Adds article body persistence so /training dashboard can show full output
-- on click. Run in Supabase SQL editor for project jonleevqitklxzzdhoye.

alter table public.colin_training_runs
  add column if not exists article_text text;
