import { loadArticles } from './scraper';
import { loadAllFeedback } from './feedback';

// Colin's signature phrases detected in generated text
// Sourced from actual published articles — palateasia.com
const COLIN_PHRASES = [
  // Transitions & pivots
  'having said that', 'in practice, though', 'alright, so',
  'and yet', 'of course,', 'as it turns out',
  'it\'s this', 'comes down to',

  // Rhetorical moves
  'all manner of', 'did we say', 'fair enough',
  'and what do we do', 'you\'ve probably', 'you\'ll find',

  // Characteristic expressions
  'tightly considered', 'on equal footing', 'in all actuality',
  'nothing against', 'the thing responsible',
  'in a way', 'for something that',
  'this only serves to', 'asking for so little',

  // Sensory / food voice
  'clings', 'perfumes', 'whispers', 'enriches',
  'frenzy', 'maniacally', 'hypnotised',
  'stripped-back', 'understated',

  // Cultural anchors
  'mamak', 'thosai', 'murtabak', 'briyani',
  'working-class', 'unpretentious',

  // Wit markers
  'hopefully not literally', 'and what do we', 'man in suspenders',
  'similarly questionable', 'slap a cover on this', 'call it a book',
  'not ask for attention', 'doesn\'t announce itself',

  // Verified phrases from published articles — structure/voice markers
  'gently persuasive', 'firmly in the background', 'great abundance of sugar',
  'ephemeral delicateness', 'remarkably easy', 'fairly reliable indicator',
  'supporting role', 'adds a nice acidity', 'stops things from becoming',
  'forcefully demanding', 'takes a more', 'which feels like as good',
  'as good an endorsement as any', 'doesn\'t need to be',
  'precisely what makes', 'something for the sweetness to push against',
  'develops in layers', 'arriving all at once',
];

const GENERIC_PHRASES = [
  'in today\'s world', 'in conclusion', 'it is worth noting',
  'delve into', 'it\'s important to note', 'furthermore',
  'in summary', 'as mentioned', 'moving on', 'firstly',
  'secondly', 'thirdly', 'to sum up', 'in a nutshell',
  'at the end of the day', 'needless to say',
  // AI jargon detected in Colin-style generation — permanently banned
  'the truth is,', 'carefully considered', 'that\'s where things get interesting',
  'suggest there might be', 'understand when to hold back',
  'there might be a way back in', 'it may be time for a rethink',
  'i\'m not claiming', 'i\'m not suggesting', 'this isn\'t about',
  'let\'s take a look', 'here\'s what', 'proves x belongs',
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
  // Colin never opens with these patterns — flag them as non-hooks
  const badOpeners = ['the ', 'in today', 'in this article', 'welcome to', 'when it comes to', 'if you\'re', 'have you ever'];
  const startsWithHook = firstSentence.length > 0 && !badOpeners.some(p => firstSentence.startsWith(p));

  const historicalWords = ['century', 'colonial', 'history', 'historical', 'tradition', 'origin', 'roots', 'founded', 'ancient', 'era'];
  // Expanded to include Malaysian food/place references Colin uses as cultural anchors
  const culturalWords = [
    'culture', 'cultural', 'community', 'class', 'society', 'ritual', 'identity', 'heritage', 'folk', 'indigenous',
    'mamak', 'kopitiam', 'thosai', 'murtabak', 'briyani', 'kuih', 'kaya', 'tau fu fah', 'belacan', 'sambal',
    'kl', 'kuala lumpur', 'bangsar', 'damansara', 'petaling jaya', 'malaysian', 'malaysia',
    'peranakan', 'nyonya', 'hawker', 'uncle at the market',
  ];

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

  // Word count: Colin's essays land 600-950 words
  const wc = metrics.wordCount;
  if (wc >= 600 && wc <= 950) score += 10;
  else if (wc >= 450 && wc <= 1100) score += 5;

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

export async function computeSimilarity(articleText: string): Promise<SimilarityReport> {
  const articles = loadArticles();
  const feedback = await loadAllFeedback();

  // Compute Colin's baselines from essay-style articles only
  // List articles (5-cocktails, 10-ways, etc.) inflate word counts significantly
  const essayArticles = articles.filter(a => {
    const slug = (a.slug ?? '').toLowerCase();
    const isListArticle = /^colin-\d+-/.test(slug) || /\b(10-ways|5-easy|5-global|7-of)\b/.test(slug);
    const wc = a.full_text.split(/\s+/).length;
    return !isListArticle && wc >= 300 && wc <= 1200;
  });
  const baselineArticles = essayArticles.length >= 5 ? essayArticles : articles;
  const colinMetrics = baselineArticles.map(a => analyzeText(a.full_text));
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
