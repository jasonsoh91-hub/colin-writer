// Full end-to-end feedback-loop test.
//
// Steps executed in order:
//   1. Snapshot: current feedback count in Supabase.
//   2. Generate article #1 via production pipeline (generate → strip → log).
//   3. Verify colin_training_runs row inserted with article_text.
//   4. Author a fresh feedback row critiquing article #1.
//   5. Verify colin_feedback row inserted.
//   6. Verify buildFeedbackPrompt() now surfaces the new critique.
//   7. Generate article #2 on a similar topic — check if it addresses the critique.
//   8. Verify article #2 also logged to training_runs.
//
// All rows visible on /training dashboard after run.

import { existsSync, readFileSync } from 'fs';
import { randomUUID } from 'crypto';

if (existsSync('.env.local')) for (const l of readFileSync('.env.local','utf-8').split('\n')) { const m=l.match(/^([A-Z_]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,''); }

import { createClient } from '@supabase/supabase-js';
import { generateArticle } from '../lib/generator';
import { stripColinSlips, type StripReport } from '../lib/colin-strip';
import { computeSimilarity } from '../lib/analyzer';
import { logTrainingRun } from '../lib/training-log';
import { saveFeedback, buildFeedbackPrompt, loadAllFeedback } from '../lib/feedback';

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

function line(s = '') { console.log(s); }
function header(n: number, label: string) {
  line(''); line('━'.repeat(72));
  line(`STEP ${n}: ${label}`);
  line('━'.repeat(72));
}

async function generate(topic: string, genre: string) {
  const stream = await generateArticle(topic, { genre, witLevel: 'dry', historicalDepth: 'light', pov: 'hybrid' });
  const raw = await streamToString(stream as ReadableStream);
  const stripReport: StripReport = { removedSentences: [], prefixStrippedSentences: [], swapsApplied: 0 };
  const polished = stripColinSlips(raw, stripReport);
  const sim = await computeSimilarity(polished);
  await logTrainingRun({
    topic, persona: 'colin', genre,
    wordCount: polished.split(/\s+/).filter(Boolean).length,
    rawWordCount: raw.split(/\s+/).filter(Boolean).length,
    textStyleScore: sim.textStyleScore, metrics: sim.article,
    droppedSentenceCount: stripReport.removedSentences.length,
    prefixStrippedCount: stripReport.prefixStrippedSentences.length,
    articleText: polished,
    metadata: { source: 'full-loop-test' },
  });
  return { polished, raw, sim, stripReport };
}

async function main() {
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

  // ── STEP 1 ────────────────────────────────────────────────────────────────
  header(1, 'Snapshot current feedback loop state');
  const before = await loadAllFeedback();
  line(`Existing feedback rows: ${before.length}`);
  line(`Last critique on file: "${(before.at(-1)?.what_to_improve ?? '(none)').slice(0, 100)}…"`);
  const trainingBefore = await sb.from('colin_training_runs').select('id', { count: 'exact', head: true });
  line(`Existing training_runs rows: ${trainingBefore.count ?? '?'}`);

  // ── STEP 2 ────────────────────────────────────────────────────────────────
  header(2, 'Generate article #1 — full production path');
  const topic1 = 'All About Chilli Oil';
  line(`Topic: "${topic1}"  Genre: gastronomic-curiosity`);
  const a1 = await generate(topic1, 'gastronomic-curiosity');
  line(`  Score: ${a1.sim.textStyleScore}/100`);
  line(`  Word count: ${a1.polished.split(/\s+/).length}`);
  line(`  Strip: dropped ${a1.stripReport.removedSentences.length}, prefix ${a1.stripReport.prefixStrippedSentences.length}`);
  line(`  First 200 chars: ${a1.polished.slice(0, 200)}…`);

  // ── STEP 3 ────────────────────────────────────────────────────────────────
  header(3, 'Verify training_runs row #1 in Supabase');
  const trainingAfter1 = await sb.from('colin_training_runs')
    .select('id, topic, text_style_score, word_count, article_text, created_at, metadata')
    .eq('topic', topic1)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (trainingAfter1.error) {
    line(`  ✗ ROW MISSING: ${trainingAfter1.error.message}`);
    return;
  }
  const row1 = trainingAfter1.data;
  line(`  ✓ Row inserted:  id=${row1.id.slice(0,8)}`);
  line(`  ✓ Topic:         ${row1.topic}`);
  line(`  ✓ Score:         ${row1.text_style_score}/100`);
  line(`  ✓ Words:         ${row1.word_count}`);
  line(`  ✓ Body persisted: ${row1.article_text ? row1.article_text.length + ' chars' : 'NULL'}`);
  line(`  ✓ Metadata:      ${JSON.stringify(row1.metadata)}`);

  // ── STEP 4 ────────────────────────────────────────────────────────────────
  header(4, 'Write feedback critiquing article #1');
  // Detect concrete issue in article #1 to critique
  const lower1 = a1.polished.toLowerCase();
  const detected: string[] = [];
  if (/at first glance/i.test(a1.polished)) detected.push("Opens with 'At first glance' — becoming an AI-tell across our recent gens");
  if (a1.polished.split(/\s+/).length > 1150) detected.push("Runs long (>1150 words). Colin's ingredient deep-dives usually cap around 1000.");
  if (/(there|here) are\s+[a-z\s,]+,\s+[a-z\s,]+,\s+and\s+/i.test(a1.polished)) detected.push("Uses comma-listed variety triplet ('X, Y, and Z') — feels like a magazine intro, not Colin");
  if (/all manner of/i.test(a1.polished)) detected.push("Uses 'all manner of' twice — Colin uses it once per article max");

  const critique = detected.length
    ? detected.join('. ') + '.'
    : "Article structurally correct but middle paragraphs use uniform paragraph lengths (all 100-120 words). Colin varies paragraph size dramatically — sometimes 40 words, sometimes 180.";

  const feedbackRow = {
    id: randomUUID(),
    topic: topic1,
    article: a1.polished,
    timestamp: Date.now(),
    rating: 8,
    what_worked: `Chilli oil opener lands. Malaysian anchor works if it referenced mamak. Named-brand mention (if any) grounds the piece.`,
    what_to_improve: critique + " For chilli oil / hot condiments, Colin would tell you WHICH KL stall he's tried, not just describe the category. Voice becomes generic without one specific-place anchor.",
    phrases_to_avoid: "'At first glance,' as an opener; 'all manner of X' more than once per article; uniform paragraph rhythm",
    phrases_to_use_more: "one specific KL / SS2 / Damansara stall or shop name; a single memory-anchored scene ('the first time I had the [X] at [Y]')",
  };
  await saveFeedback(feedbackRow);
  line(`  ✓ Critique authored:`);
  line(`    rating: ${feedbackRow.rating}/10`);
  line(`    what_to_improve: "${feedbackRow.what_to_improve.slice(0, 150)}…"`);
  line(`    phrases_to_avoid: "${feedbackRow.phrases_to_avoid}"`);

  // ── STEP 5 ────────────────────────────────────────────────────────────────
  header(5, 'Verify colin_feedback row inserted');
  const feedbackAfter = await loadAllFeedback();
  const found = feedbackAfter.find(f => f.id === feedbackRow.id);
  if (!found) {
    line(`  ✗ MISSING — Supabase insert didn't land`);
    return;
  }
  line(`  ✓ Row found:     id=${found.id.slice(0,8)}`);
  line(`  ✓ Total rows now: ${feedbackAfter.length} (was ${before.length})`);
  line(`  ✓ Order:         newest = "${feedbackAfter.at(-1)?.what_to_improve.slice(0, 80)}…"`);

  // ── STEP 6 ────────────────────────────────────────────────────────────────
  header(6, 'Verify buildFeedbackPrompt() surfaces new critique');
  const fp = await buildFeedbackPrompt();
  const criticalSection = fp.split('### MOST CRITICAL')[1]?.split('### What')[0] ?? '';
  const includedInCritical = criticalSection.includes(critique.slice(0, 40));
  const includedInWholePrompt = fp.includes(critique.slice(0, 40));
  line(`  Feedback prompt length: ${fp.length} chars`);
  line(`  Critique in MOST CRITICAL block: ${includedInCritical ? '✓ YES' : '✗ NO'}`);
  line(`  Critique anywhere in prompt:     ${includedInWholePrompt ? '✓ YES' : '✗ NO'}`);
  if (includedInCritical) {
    line(`  Preview of MOST CRITICAL section:`);
    for (const l of criticalSection.trim().split('\n').slice(0, 5)) line(`    ${l}`);
  }

  // ── STEP 7 ────────────────────────────────────────────────────────────────
  header(7, 'Generate article #2 on similar topic — check if critique applied');
  const topic2 = 'All About Sambal Belacan';
  line(`Topic: "${topic2}"  Genre: gastronomic-curiosity  (should apply critique from step 4)`);
  const a2 = await generate(topic2, 'gastronomic-curiosity');
  line(`  Score: ${a2.sim.textStyleScore}/100`);
  line(`  Word count: ${a2.polished.split(/\s+/).length}`);

  // Check if article #2 addresses the critique
  const opensAtFirstGlance = /^at first glance/i.test(a2.polished.trim());
  const allMannerCount = (a2.polished.match(/all manner of/gi) ?? []).length;
  const wordCount2 = a2.polished.split(/\s+/).length;
  const hasKLAnchor = /\b(SS2|SS15|TTDI|Bangsar|Damansara|PJ|Petaling Jaya|Kuala Lumpur|KL)\b/i.test(a2.polished);
  const hasSpecificScene = /\b(the first time|I remember|the [a-z]+ at [A-Z][a-z]+|I once)/.test(a2.polished);

  line(``);
  line(`  Critique-compliance check on article #2:`);
  line(`    Opens with 'At first glance': ${opensAtFirstGlance ? '❌ still doing it' : '✓ avoided'}`);
  line(`    'all manner of' count:        ${allMannerCount <= 1 ? '✓' : '❌'} ${allMannerCount} (target ≤1)`);
  line(`    Word count ≤1150:              ${wordCount2 <= 1150 ? '✓' : '❌'} ${wordCount2}`);
  line(`    KL / area anchor present:      ${hasKLAnchor ? '✓' : '❌'}`);
  line(`    Specific-scene anchor:         ${hasSpecificScene ? '✓' : '⚠ maybe not'}`);

  // ── STEP 8 ────────────────────────────────────────────────────────────────
  header(8, 'Verify article #2 logged to training_runs');
  const trainingAfter2 = await sb.from('colin_training_runs')
    .select('id, topic, text_style_score, article_text, created_at')
    .eq('topic', topic2)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (trainingAfter2.error) {
    line(`  ✗ Row missing: ${trainingAfter2.error.message}`);
  } else {
    line(`  ✓ Row inserted:  id=${trainingAfter2.data.id.slice(0,8)}`);
    line(`  ✓ Body persisted: ${trainingAfter2.data.article_text ? trainingAfter2.data.article_text.length + ' chars' : 'NULL'}`);
  }

  // ── FINAL SUMMARY ─────────────────────────────────────────────────────────
  line('');
  line('━'.repeat(72));
  line('LOOP COMPLETION CHECK');
  line('━'.repeat(72));
  const trainingAfter = await sb.from('colin_training_runs').select('id', { count: 'exact', head: true });
  line(`  training_runs: ${trainingBefore.count} → ${trainingAfter.count}  (delta: +${(trainingAfter.count ?? 0) - (trainingBefore.count ?? 0)})`);
  line(`  colin_feedback: ${before.length} → ${feedbackAfter.length}  (delta: +${feedbackAfter.length - before.length})`);
  line(`  Both articles viewable on /training and clickable for full-body reveal.`);
  line('');
  line('Snippet of article #2 close (last 400 chars) — see if critique landed:');
  line(a2.polished.slice(-400));
}

main().catch(e => { console.error(e); process.exit(1); });
