// Second-round iteration: 5 new topics not previously tested.
// Runs the SAME production pipeline as the UI:
//   generateArticle → stripColinSlips → analyzer → Supabase log
// So results show up on /training just like a UI generation would.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import * as path from 'path';

const envFile = '.env.local';
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

import { generateArticle } from '../lib/generator';
import { stripColinSlips, type StripReport } from '../lib/colin-strip';
import { computeSimilarity } from '../lib/analyzer';
import { logTrainingRun } from '../lib/training-log';

interface Topic {
  id: string;
  topic: string;
  genre: string;
  notes: string;
}

const TOPICS: Topic[] = [
  {
    id: 'vinegar',
    topic: 'All About Vinegar',
    genre: 'gastronomic-curiosity',
    notes: 'Ingredient deep-dive matching Colin\'s butter/coffee beat',
  },
  {
    id: 'instant-coffee',
    topic: 'The Truth About Instant Coffee',
    genre: 'debunking-explainer',
    notes: 'Debunk received wisdom — mirrors capsaicin/umami science format',
  },
  {
    id: 'sauces',
    topic: '3 Sauces You Should Always Have In The Fridge',
    genre: 'lifestyle-guide',
    notes: 'Kitchen list with item subheadings — mirrors kitchen-tools format',
  },
  {
    id: 'sourdough',
    topic: 'How Sourdough Actually Rises',
    genre: 'debunking-explainer',
    notes: 'Science explainer for the fermentation crowd',
  },
  {
    id: 'craft-beer',
    topic: 'Inside The Rise Of Malaysian Craft Beer',
    genre: 'gastronomic-curiosity',
    notes: 'Regional beat + Colin\'s KL cultural anchor',
  },
];

const RUN_LABEL = 'next-5';
const RUN_DIR = path.join(process.cwd(), 'data', 'iteration-runs', RUN_LABEL);
mkdirSync(RUN_DIR, { recursive: true });

async function streamToString(s: ReadableStream): Promise<string> {
  const reader = s.getReader();
  const decoder = new TextDecoder();
  let out = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

async function runOne(t: Topic) {
  console.log(`\n▶ ${t.id} — "${t.topic}" [${t.genre}]`);
  const stream = await generateArticle(t.topic, {
    genre: t.genre,
    witLevel: 'dry',
    historicalDepth: 'light',
    pov: 'hybrid',
  });
  const raw = await streamToString(stream as ReadableStream);
  const stripReport: StripReport = { removedSentences: [], prefixStrippedSentences: [], swapsApplied: 0 };
  const polished = stripColinSlips(raw, stripReport);

  const report = await computeSimilarity(polished);

  const outFile = path.join(RUN_DIR, `${t.id}.md`);
  writeFileSync(outFile, polished);
  writeFileSync(outFile.replace(/\.md$/, '.raw.md'), raw);
  writeFileSync(outFile.replace(/\.md$/, '.score.json'), JSON.stringify({ ...report, stripReport, topicMeta: t }, null, 2));

  // Log to Supabase — same shape as production /api/generate does
  await logTrainingRun({
    topic: t.topic,
    persona: 'colin',
    genre: t.genre,
    wordCount: polished.split(/\s+/).filter(Boolean).length,
    rawWordCount: raw.split(/\s+/).filter(Boolean).length,
    textStyleScore: report.textStyleScore,
    metrics: report.article,
    droppedSentenceCount: stripReport.removedSentences.length,
    prefixStrippedCount: stripReport.prefixStrippedSentences.length,
    articleText: polished,
    metadata: { source: 'iterate-colin-next5', runLabel: RUN_LABEL, topicId: t.id, notes: t.notes },
  });

  console.log(`  Score: ${report.textStyleScore}/100 · ${polished.split(/\s+/).length}w (raw ${raw.split(/\s+/).length}w)`);
  console.log(`  Colin phrases: ${report.article.colinPhrasesFound.length} · Generic: ${report.article.genericPhrasesFound.length}`);
  if (stripReport.removedSentences.length) console.log(`  ✂ Dropped ${stripReport.removedSentences.length}`);
  if (stripReport.prefixStrippedSentences.length) console.log(`  ✎ Prefix-stripped ${stripReport.prefixStrippedSentences.length}`);
  if (report.article.genericPhrasesFound.length) console.log(`  ⚠ Slips: ${report.article.genericPhrasesFound.join(', ')}`);

  return { t, score: report.textStyleScore, polished, stripReport, metrics: report.article };
}

async function main() {
  console.log(`Run label: ${RUN_LABEL}`);
  const results = [];
  for (const t of TOPICS) {
    try {
      results.push(await runOne(t));
    } catch (err) {
      console.error(`  ✗ ${t.id}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log('SUMMARY');
  console.log('─'.repeat(60));
  console.log('id'.padEnd(18), 'genre'.padEnd(22), 'score'.padStart(6));
  for (const r of results) {
    console.log(r.t.id.padEnd(18), r.t.genre.padEnd(22), String(r.score).padStart(6));
  }
  const avg = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length);
  console.log('─'.repeat(60));
  console.log(`avg: ${avg}/100  ·  target: 85`);
}

main().catch(e => { console.error(e); process.exit(1); });
