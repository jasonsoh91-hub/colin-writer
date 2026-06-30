// Iteration harness for Colin voice fidelity.
//
// For each topic in TEST_TOPICS, generate an article via the live generator
// pipeline and score it against Colin's published-article fingerprint via
// the existing analyzer. Persist results so we can diff runs across edits.
//
// Run: npx tsx scripts/iterate-colin.ts [label]
//   label — optional folder name for this run (default: timestamp)

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import * as path from 'path';

// Load .env.local manually (Next loads it for the server; tsx scripts don't)
const envFile = '.env.local';
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

import { generateArticle } from '../lib/generator';
import { computeSimilarity } from '../lib/analyzer';
import { stripColinSlips, type StripReport } from '../lib/colin-strip';

interface TestTopic {
  id: string;          // file-safe id
  topic: string;       // the actual topic string sent to the generator
  genre: string;       // taxonomy genre id
  reference?: string;  // slug of the closest real Colin article (for diff)
  notes?: string;      // why this topic
}

const TEST_TOPICS: TestTopic[] = [
  {
    id: 'olive-oil',
    topic: 'All About Olive Oil',
    genre: 'gastronomic-curiosity',
    reference: 'all-about-butter',
    notes: 'Ingredient deep-dive matching Colin\'s recent "All About Butter" beat',
  },
  {
    id: 'pantry-staples',
    topic: 'The Pantry Staples Every Home Cook Actually Needs',
    genre: 'lifestyle-guide',
    reference: 'kitchen-tools-you-need',
    notes: 'Lifestyle guide matching the "Forget The Gadgets" beat — 3 items, prose-anchored',
  },
  {
    id: 'umami',
    topic: 'How Umami Actually Works: The Science Of The Fifth Taste',
    genre: 'debunking-explainer',
    reference: 'how-capsaicin-works',
    notes: 'Science explainer matching the capsaicin beat — debunk + evidence',
  },
];

const ROOT = process.cwd();
const RUN_LABEL = process.argv[2] || new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const RUN_DIR = path.join(ROOT, 'data', 'iteration-runs', RUN_LABEL);
mkdirSync(RUN_DIR, { recursive: true });

async function streamToString(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    full += decoder.decode(value, { stream: true });
  }
  return full;
}

interface RunResult {
  id: string;
  topic: string;
  genre: string;
  reference?: string;
  wordCount: number;
  textStyleScore: number;
  colinAvgWordCount: number;
  colinAvgSentenceLength: number;
  metrics: ReturnType<typeof JSON.parse>;
  outputFile: string;
}

async function runOne(t: TestTopic): Promise<RunResult> {
  console.log(`\n▶ ${t.id} — "${t.topic}" [${t.genre}]`);
  const stream = await generateArticle(t.topic, {
    genre: t.genre,
    witLevel: 'dry',
    historicalDepth: 'light',
    pov: 'hybrid',
  });
  const raw = await streamToString(stream as ReadableStream);

  // Deterministic post-process: drop sentences with AI-tell phrases, swap banned words.
  const stripReport: StripReport = { removedSentences: [], prefixStrippedSentences: [], swapsApplied: 0 };
  const article = stripColinSlips(raw, stripReport);

  const report = await computeSimilarity(article);

  const outputFile = path.join(RUN_DIR, `${t.id}.md`);
  writeFileSync(outputFile, article);
  writeFileSync(outputFile.replace(/\.md$/, '.raw.md'), raw);
  writeFileSync(outputFile.replace(/\.md$/, '.score.json'), JSON.stringify({ ...report, stripReport }, null, 2));

  console.log(`  Score: ${report.textStyleScore} / 100  ·  ${article.split(/\s+/).length} words (raw: ${raw.split(/\s+/).length})`);
  console.log(`  Colin phrases: ${report.article.colinPhrasesFound.length}  ·  Generic phrases: ${report.article.genericPhrasesFound.length}`);
  if (stripReport.removedSentences.length) {
    console.log(`  ✂ Dropped ${stripReport.removedSentences.length} full sentence(s):`);
    for (const s of stripReport.removedSentences) console.log(`     · "${s.slice(0, 100)}${s.length > 100 ? '…' : ''}"`);
  }
  if (stripReport.prefixStrippedSentences.length) {
    console.log(`  ✎ Prefix-stripped ${stripReport.prefixStrippedSentences.length} sentence(s):`);
    for (const s of stripReport.prefixStrippedSentences) console.log(`     · "${s.slice(0, 100)}${s.length > 100 ? '…' : ''}"`);
  }
  if (report.article.genericPhrasesFound.length) {
    console.log(`  ⚠ Generic phrases still present: ${report.article.genericPhrasesFound.join(', ')}`);
  }

  return {
    id: t.id,
    topic: t.topic,
    genre: t.genre,
    reference: t.reference,
    wordCount: article.split(/\s+/).length,
    textStyleScore: report.textStyleScore,
    colinAvgWordCount: report.colinAvgWordCount,
    colinAvgSentenceLength: report.colinAvgSentenceLength,
    metrics: report.article,
    outputFile,
  };
}

async function main() {
  console.log(`Run: ${RUN_LABEL}`);
  console.log(`Output dir: ${RUN_DIR}\n`);

  const results: RunResult[] = [];
  for (const t of TEST_TOPICS) {
    try {
      results.push(await runOne(t));
    } catch (err) {
      console.error(`  ✗ ${t.id} failed:`, err instanceof Error ? err.message : err);
    }
  }

  // Summary table
  console.log('\n' + '─'.repeat(70));
  console.log('SUMMARY');
  console.log('─'.repeat(70));
  console.log('id'.padEnd(20), 'words'.padStart(6), 'score'.padStart(7), 'colin'.padStart(7), 'gen'.padStart(5));
  for (const r of results) {
    console.log(
      r.id.padEnd(20),
      String(r.wordCount).padStart(6),
      String(r.textStyleScore).padStart(7),
      String(r.metrics.colinPhrasesFound.length).padStart(7),
      String(r.metrics.genericPhrasesFound.length).padStart(5),
    );
  }
  const avg = results.length ? Math.round(results.reduce((s, r) => s + r.textStyleScore, 0) / results.length) : 0;
  console.log('─'.repeat(70));
  console.log(`avg score: ${avg} / 100  ·  target: 85`);
  console.log(`Files in: ${RUN_DIR}`);

  writeFileSync(path.join(RUN_DIR, '_summary.json'), JSON.stringify({ runLabel: RUN_LABEL, avg, results }, null, 2));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
