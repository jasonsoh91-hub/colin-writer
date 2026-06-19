import { loadArticles } from './scraper';
import { loadAllFeedback } from './feedback';

// Colin's signature phrases detected in generated text
const COLIN_PHRASES = [
  'quietly making its way', 'coloured past', 'mildly alcoholic',
  'escapes tidy translation', 'working-class', 'unpretentious',
  'deeply satisfying', 'tip of the iceberg', 'all but',
  'owing perhaps', 'in the gutter', 'all manner of',
  'did we say', 'fair enough', 'sounds sensible',
  'great lengths', 'pummel', 'audacity', 'resistance',
  'slowly stepping', 'inner world', 'made physical',
];

const GENERIC_PHRASES = [
  'in today\'s world', 'in conclusion', 'it is worth noting',
  'delve into', 'it\'s important to note', 'furthermore',
  'in summary', 'as mentioned', 'moving on', 'firstly',
  'secondly', 'thirdly', 'to sum up', 'in a nutshell',
  'at the end of the day', 'needless to say',
];

export interface ArticleMetrics {
  wordCount: number;
  sentenceCount: number;
  avgSentenceLength: number;
  paragraphCount: number;
  avgParagraphLength: number;
  colinPhrasesFound: string[];
  genericPhrasesFound: string[];
  startsWithHook: boolean;
  hasHistoricalRef: boolean;
  hasCulturalRef: boolean;
}

export interface SimilarityReport {
  // From Colin's real articles (baseline)
  colinAvgWordCount: number;
  colinAvgSentenceLength: number;

  // Current article
  article: ArticleMetrics;

  // Style score (0-100)
  textStyleScore: number;

  // From feedback
  avgRating: number;
  ratingTrend: { review: number; rating: number; label: string }[];
  totalReviews: number;

  // Overall similarity (blend of text analysis + human rating)
  overallSimilarity: number;
}

function analyzeText(text: string): ArticleMetrics {
  const clean = text.replace(/\s+/g, ' ').trim();
  const words = clean.split(' ').filter(Boolean);
  const sentences = clean.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const paragraphs = text.split('\n').filter(p => p.trim().length > 20);

  const lower = clean.toLowerCase();

  const colinPhrasesFound = COLIN_PHRASES.filter(p => lower.includes(p.toLowerCase()));
  const genericPhrasesFound = GENERIC_PHRASES.filter(p => lower.includes(p.toLowerCase()));

  const firstSentence = sentences[0]?.toLowerCase() ?? '';
  const startsWithHook = !firstSentence.startsWith('the ') && !firstSentence.startsWith('in ') && firstSentence.length > 0;

  const historicalWords = ['century', 'colonial', 'history', 'historical', 'tradition', 'origin', 'roots', 'founded', 'ancient', 'era'];
  const culturalWords = ['culture', 'cultural', 'community', 'class', 'society', 'ritual', 'identity', 'heritage', 'folk', 'indigenous'];

  const hasHistoricalRef = historicalWords.some(w => lower.includes(w));
  const hasCulturalRef = culturalWords.some(w => lower.includes(w));

  return {
    wordCount: words.length,
    sentenceCount: sentences.length,
    avgSentenceLength: sentences.length ? Math.round(words.length / sentences.length) : 0,
    paragraphCount: paragraphs.length,
    avgParagraphLength: paragraphs.length ? Math.round(words.length / paragraphs.length) : 0,
    colinPhrasesFound,
    genericPhrasesFound,
    startsWithHook,
    hasHistoricalRef,
    hasCulturalRef,
  };
}

function computeTextStyleScore(metrics: ArticleMetrics, colinAvgWordCount: number, colinAvgSentenceLength: number): number {
  let score = 50; // base

  // Word count in his range (600-900)
  if (metrics.wordCount >= 550 && metrics.wordCount <= 950) score += 10;
  else if (metrics.wordCount >= 400 && metrics.wordCount <= 1100) score += 5;

  // Sentence length close to Colin's avg (~18-22 words)
  const sentenceDiff = Math.abs(metrics.avgSentenceLength - colinAvgSentenceLength);
  if (sentenceDiff <= 3) score += 10;
  else if (sentenceDiff <= 6) score += 5;

  // Colin phrases detected
  score += Math.min(metrics.colinPhrasesFound.length * 3, 12);

  // Generic phrases penalty
  score -= metrics.genericPhrasesFound.length * 5;

  // Hook, history, culture
  if (metrics.startsWithHook) score += 5;
  if (metrics.hasHistoricalRef) score += 5;
  if (metrics.hasCulturalRef) score += 3;

  // Paragraph structure (he writes 5-8 paragraphs)
  if (metrics.paragraphCount >= 5 && metrics.paragraphCount <= 9) score += 5;

  return Math.max(0, Math.min(100, score));
}

export function computeSimilarity(articleText: string): SimilarityReport {
  const articles = loadArticles();
  const feedback = loadAllFeedback();

  // Compute Colin's baselines from real articles
  const colinMetrics = articles.map(a => analyzeText(a.full_text));
  const colinAvgWordCount = colinMetrics.length
    ? Math.round(colinMetrics.reduce((s, m) => s + m.wordCount, 0) / colinMetrics.length)
    : 750;
  const colinAvgSentenceLength = colinMetrics.length
    ? Math.round(colinMetrics.reduce((s, m) => s + m.avgSentenceLength, 0) / colinMetrics.length)
    : 20;

  const article = analyzeText(articleText);
  const textStyleScore = computeTextStyleScore(article, colinAvgWordCount, colinAvgSentenceLength);

  const ratingTrend = feedback.map((f, i) => ({
    review: i + 1,
    rating: f.rating,
    label: f.topic,
  }));

  const avgRating = feedback.length
    ? feedback.reduce((s, f) => s + f.rating, 0) / feedback.length
    : 0;

  // Blend: 40% text analysis + 60% human rating (if reviews exist)
  const overallSimilarity = feedback.length
    ? Math.round(textStyleScore * 0.4 + (avgRating / 10) * 100 * 0.6)
    : textStyleScore;

  return {
    colinAvgWordCount,
    colinAvgSentenceLength,
    article,
    textStyleScore,
    avgRating,
    ratingTrend,
    totalReviews: feedback.length,
    overallSimilarity,
  };
}
