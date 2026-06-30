// Backfill: copy article bodies from data/iteration-runs/{run}/{id}.md
// into existing colin_training_runs rows (those inserted by
// scripts/backfill-training-runs.ts which only set metadata, not text).
//
// Match strategy: metadata->>runLabel = run dir + topic = file slug topic.

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import * as path from 'path';

const envFile = '.env.local';
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

import { createClient } from '@supabase/supabase-js';

const TOPIC_BY_ID: Record<string, string> = {
  'olive-oil': 'All About Olive Oil',
  'pantry-staples': 'The Pantry Staples Every Home Cook Actually Needs',
  'umami': 'How Umami Actually Works: The Science Of The Fifth Taste',
};

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
    process.exit(1);
  }
  const sb = createClient(url, key);

  const runsDir = path.join(process.cwd(), 'data', 'iteration-runs');
  if (!existsSync(runsDir)) {
    console.log('No iteration-runs dir; nothing to backfill.');
    return;
  }

  let updated = 0;
  let skipped = 0;

  for (const runLabel of readdirSync(runsDir).filter(d => !d.startsWith('_'))) {
    const runPath = path.join(runsDir, runLabel);
    if (!statSync(runPath).isDirectory()) continue;

    for (const [id, topic] of Object.entries(TOPIC_BY_ID)) {
      const mdFile = path.join(runPath, `${id}.md`);
      if (!existsSync(mdFile)) continue;
      const articleText = readFileSync(mdFile, 'utf-8');

      // Find the row inserted by backfill-training-runs.ts for this (runLabel, topic)
      const { data: rows, error: selErr } = await sb
        .from('colin_training_runs')
        .select('id, article_text, metadata, topic')
        .eq('topic', topic)
        .eq('metadata->>runLabel', runLabel);

      if (selErr) {
        console.error(`✗ ${runLabel}/${id} select: ${selErr.message}`);
        continue;
      }
      if (!rows || rows.length === 0) {
        console.warn(`- ${runLabel}/${id}: no matching row`);
        skipped++;
        continue;
      }
      // Update all matches (should be 1)
      for (const row of rows) {
        if (row.article_text) {
          skipped++;
          continue;
        }
        const { error: upErr } = await sb
          .from('colin_training_runs')
          .update({ article_text: articleText })
          .eq('id', row.id);
        if (upErr) {
          console.error(`✗ ${runLabel}/${id} update: ${upErr.message}`);
        } else {
          updated++;
          console.log(`✓ ${runLabel}/${id} → ${articleText.length} chars`);
        }
      }
    }
  }

  console.log(`\nDone — ${updated} row(s) updated, ${skipped} skipped (already had text or no match).`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
