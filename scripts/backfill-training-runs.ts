// Backfill iteration runs (baseline-1, iter-2, … iter-6) into the
// colin_training_runs table so the /training dashboard isn't empty on first
// load. Requires the SQL migration to be applied first
// (supabase/migrations/colin_training_runs.sql).

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

const TOPIC_GENRE: Record<string, { topic: string; genre: string }> = {
  'olive-oil': { topic: 'All About Olive Oil', genre: 'gastronomic-curiosity' },
  'pantry-staples': { topic: 'The Pantry Staples Every Home Cook Actually Needs', genre: 'lifestyle-guide' },
  'umami': { topic: 'How Umami Actually Works: The Science Of The Fifth Taste', genre: 'debunking-explainer' },
};

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env.local');
    process.exit(1);
  }
  const sb = createClient(url, key);

  const runsDir = path.join(process.cwd(), 'data', 'iteration-runs');
  if (!existsSync(runsDir)) {
    console.log('No iteration-runs dir; nothing to backfill.');
    return;
  }

  const runs = readdirSync(runsDir).filter(d => !d.startsWith('_'));
  let inserted = 0;
  for (const runLabel of runs) {
    const runPath = path.join(runsDir, runLabel);
    if (!statSync(runPath).isDirectory()) continue;
    const summaryFile = path.join(runPath, '_summary.json');
    if (!existsSync(summaryFile)) continue;
    const summary = JSON.parse(readFileSync(summaryFile, 'utf-8'));
    const runTs = statSync(summaryFile).mtime;

    for (const r of summary.results ?? []) {
      const meta = TOPIC_GENRE[r.id] ?? { topic: r.topic ?? r.id, genre: r.genre ?? null };
      // Spread runs of a single iteration over a few seconds so the chart has order.
      const ts = new Date(runTs.getTime() + (summary.results.indexOf(r) * 1000));

      const scoreFile = path.join(runPath, `${r.id}.score.json`);
      let dropped = 0;
      let prefix = 0;
      if (existsSync(scoreFile)) {
        const sc = JSON.parse(readFileSync(scoreFile, 'utf-8'));
        dropped = sc.stripReport?.removedSentences?.length ?? 0;
        prefix = sc.stripReport?.prefixStrippedSentences?.length ?? 0;
      }

      const row = {
        created_at: ts.toISOString(),
        topic: meta.topic,
        persona: 'colin',
        genre: meta.genre,
        word_count: r.wordCount ?? 0,
        raw_word_count: r.wordCount ?? 0,
        text_style_score: r.textStyleScore ?? 0,
        colin_phrases_found: r.metrics?.colinPhrasesFound?.length ?? 0,
        generic_phrases_found: r.metrics?.genericPhrasesFound?.length ?? 0,
        starts_with_hook: r.metrics?.startsWithHook ?? false,
        has_cultural_ref: r.metrics?.hasCulturalRef ?? false,
        dropped_sentence_count: dropped,
        prefix_stripped_count: prefix,
        metadata: { source: 'backfill', runLabel },
      };
      const { error } = await sb.from('colin_training_runs').insert(row);
      if (error) {
        console.error(`✗ ${runLabel}/${r.id}: ${error.message}`);
      } else {
        inserted++;
        console.log(`✓ ${runLabel}/${r.id} → score ${r.textStyleScore}`);
      }
    }
  }
  console.log(`\nDone — ${inserted} run(s) backfilled.`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
