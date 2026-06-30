// Colin corpus "ceiling" — runs the same analyzer over Colin's real published
// articles to set the upper bound the AI is trying to reach.
//
// If AI Colin rolling avg = corpus ceiling, the heuristic can't tell them apart.
// The gap is the training target.
//
// Computed once per Node process and memoised.

import { loadArticles } from './scraper';
import { computeSimilarity } from './analyzer';

interface CeilingResult {
  ceilingAvg: number;       // avg textStyleScore across real Colin articles
  ceilingMedian: number;    // median textStyleScore
  ceilingMin: number;
  ceilingMax: number;
  sampleSize: number;
}

let memo: CeilingResult | null = null;

export async function computeColinCeiling(): Promise<CeilingResult> {
  if (memo) return memo;

  const articles = loadArticles('colin');
  // Filter list-style and very short pieces — same filter the analyzer uses
  const essays = articles.filter(a => {
    const slug = (a.slug ?? '').toLowerCase();
    const isListArticle = /^colin-\d+-/.test(slug) || /\b(10-ways|5-easy|5-global|7-of)\b/.test(slug);
    const wc = a.full_text.split(/\s+/).length;
    return !isListArticle && wc >= 300 && wc <= 2500;
  });

  const scores: number[] = [];
  for (const a of essays) {
    const r = await computeSimilarity(a.full_text);
    scores.push(r.textStyleScore);
  }

  if (scores.length === 0) {
    memo = { ceilingAvg: 100, ceilingMedian: 100, ceilingMin: 100, ceilingMax: 100, sampleSize: 0 };
    return memo;
  }

  scores.sort((a, b) => a - b);
  const avg = Math.round(scores.reduce((s, x) => s + x, 0) / scores.length);
  const median = scores[Math.floor(scores.length / 2)];

  memo = {
    ceilingAvg: avg,
    ceilingMedian: median,
    ceilingMin: scores[0],
    ceilingMax: scores[scores.length - 1],
    sampleSize: scores.length,
  };
  return memo;
}
