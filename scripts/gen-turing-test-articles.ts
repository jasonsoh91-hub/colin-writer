// Generate 3 fresh AI articles for Round 4 + Round 5 of the Turing test slide.
// Uses same production pipeline: generate → strip → log to Supabase.

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

const TOPICS = [
  { id: 'salt', topic: 'All About Salt', genre: 'gastronomic-curiosity' },
  { id: 'chocolate', topic: 'All About Chocolate', genre: 'gastronomic-curiosity' },
  { id: 'fermentation', topic: 'How Fermentation Actually Works', genre: 'debunking-explainer' },
];

const RUN_DIR = path.join(process.cwd(), 'data', 'iteration-runs', 'turing-test');
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

async function main() {
  for (const t of TOPICS) {
    console.log(`\n▶ ${t.id}`);
    const stream = await generateArticle(t.topic, { genre: t.genre, witLevel: 'dry', historicalDepth: 'light', pov: 'hybrid' });
    const raw = await streamToString(stream as ReadableStream);
    const stripReport: StripReport = { removedSentences: [], prefixStrippedSentences: [], swapsApplied: 0 };
    const polished = stripColinSlips(raw, stripReport);
    const sim = await computeSimilarity(polished);

    writeFileSync(path.join(RUN_DIR, `${t.id}.md`), polished);

    await logTrainingRun({
      topic: t.topic, persona: 'colin', genre: t.genre,
      wordCount: polished.split(/\s+/).filter(Boolean).length,
      rawWordCount: raw.split(/\s+/).filter(Boolean).length,
      textStyleScore: sim.textStyleScore, metrics: sim.article,
      droppedSentenceCount: stripReport.removedSentences.length,
      prefixStrippedCount: stripReport.prefixStrippedSentences.length,
      articleText: polished,
      metadata: { source: 'gen-turing-test-articles', runLabel: 'turing-test', topicId: t.id },
    });

    console.log(`  Score: ${sim.textStyleScore}/100 · ${polished.split(/\s+/).length}w`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
