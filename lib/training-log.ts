// Training log — persists every Colin generation to Supabase so the
// /training dashboard can plot voice-fidelity progress over time.
//
// Writes are best-effort: if Supabase is unreachable or the table is
// missing, log to console and let the generation flow continue. The
// user shouldn't see a generation fail because the metrics sink is down.

import { createClient } from '@supabase/supabase-js';
import type { ArticleMetrics } from './analyzer';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export interface TrainingRunInput {
  topic: string;
  persona: string;
  genre?: string | null;
  wordCount: number;
  rawWordCount?: number;
  textStyleScore: number;
  metrics: ArticleMetrics;
  droppedSentenceCount: number;
  prefixStrippedCount: number;
  metadata?: Record<string, unknown>;
}

export async function logTrainingRun(input: TrainingRunInput): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const { error } = await sb.from('colin_training_runs').insert({
      topic: input.topic,
      persona: input.persona,
      genre: input.genre ?? null,
      word_count: input.wordCount,
      raw_word_count: input.rawWordCount ?? input.wordCount,
      text_style_score: input.textStyleScore,
      colin_phrases_found: input.metrics.colinPhrasesFound.length,
      generic_phrases_found: input.metrics.genericPhrasesFound.length,
      starts_with_hook: input.metrics.startsWithHook,
      has_cultural_ref: input.metrics.hasCulturalRef,
      dropped_sentence_count: input.droppedSentenceCount,
      prefix_stripped_count: input.prefixStrippedCount,
      metadata: input.metadata ?? null,
    });
    if (error) console.warn('[training-log] insert failed:', error.message);
  } catch (err) {
    console.warn('[training-log] error:', err instanceof Error ? err.message : err);
  }
}

export interface TrainingRunRow {
  id: string;
  created_at: string;
  topic: string;
  persona: string;
  genre: string | null;
  word_count: number;
  raw_word_count: number | null;
  text_style_score: number;
  colin_phrases_found: number;
  generic_phrases_found: number;
  dropped_sentence_count: number;
  prefix_stripped_count: number;
}

export async function getRecentRuns(limit = 50, persona = 'colin'): Promise<TrainingRunRow[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('colin_training_runs')
    .select('id, created_at, topic, persona, genre, word_count, raw_word_count, text_style_score, colin_phrases_found, generic_phrases_found, dropped_sentence_count, prefix_stripped_count')
    .eq('persona', persona)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[training-log] select failed:', error.message);
    return [];
  }
  return (data ?? []) as TrainingRunRow[];
}

export interface TrainingStats {
  totalRuns: number;
  rollingAvgLast10: number | null;
  rollingAvgPrev10: number | null;
  delta: number | null;
  byGenre: { genre: string; avgScore: number; runs: number }[];
  trend: number[]; // last N scores oldest→newest for sparkline
  recent: TrainingRunRow[];
}

export function computeStats(rows: TrainingRunRow[]): TrainingStats {
  const totalRuns = rows.length;
  // rows are newest-first; reverse for chronological
  const chrono = [...rows].reverse();

  const last10 = chrono.slice(-10);
  const prev10 = chrono.slice(-20, -10);
  const avg = (xs: TrainingRunRow[]) =>
    xs.length ? Math.round(xs.reduce((s, r) => s + r.text_style_score, 0) / xs.length) : null;

  const rollingAvgLast10 = avg(last10);
  const rollingAvgPrev10 = avg(prev10);
  const delta =
    rollingAvgLast10 !== null && rollingAvgPrev10 !== null
      ? rollingAvgLast10 - rollingAvgPrev10
      : null;

  // by genre over all runs
  const buckets = new Map<string, number[]>();
  for (const r of rows) {
    const g = r.genre ?? 'unknown';
    if (!buckets.has(g)) buckets.set(g, []);
    buckets.get(g)!.push(r.text_style_score);
  }
  const byGenre = Array.from(buckets.entries())
    .map(([genre, scores]) => ({
      genre,
      avgScore: Math.round(scores.reduce((s, x) => s + x, 0) / scores.length),
      runs: scores.length,
    }))
    .sort((a, b) => b.runs - a.runs);

  const trend = chrono.slice(-20).map(r => r.text_style_score);

  return {
    totalRuns,
    rollingAvgLast10,
    rollingAvgPrev10,
    delta,
    byGenre,
    trend,
    recent: rows.slice(0, 10),
  };
}
