// Self-hosted AI-likelihood scoring.
// Heuristic component (sync) + perplexity component (async via OpenRouter logprobs).
// Output: 0-100 where higher = more AI-like.

import { computePerplexity, perplexityScore } from './perplexity';

// AI-favoured vocabulary that detectors flag. Frequency drives part of the score.
const AI_VOCAB = new Set([
  "vibrant", "showcasing", "showcase", "pivotal", "tapestry", "testament",
  "underscore", "underscores", "intricate", "fostering", "enhancing", "boasts",
  "nestled", "groundbreaking", "breathtaking", "renowned", "bustling",
  "passionate", "dedicated", "undeniably", "moreover", "furthermore",
  "additionally", "delve", "delves", "delving", "leverage", "leveraging",
  "robust", "seamless", "seamlessly", "navigate", "navigating", "embark",
  "elevate", "elevating", "myriad", "plethora", "realm", "landscape",
  "ecosystem", "synergy", "holistic", "paradigm", "cultivate", "cultivating",
  "spearhead", "noteworthy", "endeavor", "endeavour", "facilitate",
  "facilitating", "utilise", "utilize", "comprehensive", "transformative",
  "innovative", "cutting-edge", "state-of-the-art", "unparalleled",
  "unprecedented", "remarkable", "remarkably", "essentially", "fundamentally",
  "ultimately", "consequently", "subsequently", "specifically", "particularly",
  "notably", "importantly", "interestingly", "crucially",
]);

// AI structural phrases — bigrams/trigrams typical of LLM output.
const AI_PHRASES = [
  "it's important", "it's worth", "as a result", "in this article",
  "in summary", "in conclusion", "the truth is", "let's get", "let's dive",
  "let's explore", "here's the thing", "you'd be forgiven", "i'm not claiming",
  "i'm not suggesting", "at its core", "what really matters", "the real question",
  "may be time", "we've been trained", "we've been conditioned",
  "the next time you", "so the next time", "what follows is", "what follows isn't",
  "not just", "not only", "but also",
  // Newly added — observed in failing 87% GPTZero sample
  "it's the difference between", "the difference between",
  "what you get is", "what's left is",
  "the thing about", "the thing is",
  "doing it catastrophically wrong", "catastrophically wrong",
  "is only as good as", "only as good as",
  "in a way that feels", "in a way that",
  "small adjustment", "small shift",
  "if you know where to look",
  "it doesn't require any special",
  "see if it changes",
  "instead of a vague",
  "deserves a second look",
];

// "Not X, but Y" rhetorical pattern — used to fake nuance.
const NOT_X_BUT_Y_RE = /\bnot because\b[^.!?]{3,80}\bbut because\b/gi;
const NOT_X_BUT_Y_RE2 = /\bit's not about\b[^.!?]{3,80}\bit's about\b/gi;
// "Not only X but also Y" — auto-fail per humanizer protocol.
const NOT_ONLY_BUT_ALSO_RE = /\bnot only\b[^.!?]{3,80}\bbut also\b/gi;

// "Less X, more Y" sensory parallel pattern.
const LESS_X_MORE_Y_RE = /\bless\s+\w+[,.]?\s+more\s+\w+\b/gi;

// CTA-list closer: 3+ short imperative sentences at end of article.
const IMPERATIVE_OPENERS = /^(hold|slice|soak|toast|stir|add|cut|cook|use|put|pour|grab|reach|try|take|pull|wait|let|skip|swap|drop|chuck|leave|keep|store|push|reach|finish|start|stop|find|look|do|don't|just|first|next)\b/i;

export interface ScoreBreakdown {
  burstiness: number;        // sentence length std dev / mean. higher = more human.
  avgSentenceLength: number; // AI tends to 22 words avg
  vocabDiversity: number;    // unique / total tokens
  aiVocabRate: number;       // AI vocab hits per 100 words
  aiPhraseHits: number;      // AI structural phrases found
  emDashCount: number;       // GPTZero loves these
  fragmentCount: number;     // sentences under 6 words = human signal
  shortSentenceRate: number; // % sentences under 8 words
  longSentenceRate: number;  // % sentences over 35 words
  paragraphLengthCV: number; // coefficient of variation, paragraph word counts
  notXButYHits: number;      // "not because X, but because Y" pattern
  lessMoreHits: number;      // "less X, more Y" sensory parallel
  ctaCloserImperatives: number; // imperative count in last paragraph
  rhetoricalQuestions: number; // short setup-question sentences
  subjectDropFragments: number; // sentences starting with verb (subject dropped)
  emphaticSingleSentenceParas: number; // 1-sentence under-8-word paragraphs
  perplexity?: number;       // from perplexity.ts if available
}

export interface AIScore {
  score: number;             // 0-100, higher = more AI
  label: "human" | "borderline" | "ai";
  breakdown: ScoreBreakdown;
  reasons: string[];         // top contributors
}

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9'\s-]/g, " ").split(/\s+/).filter(Boolean);
}

function splitSentences(text: string): string[] {
  return text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 2);
}

function splitParagraphs(text: string): string[] {
  return text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
}

function mean(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function analyze(text: string): ScoreBreakdown {
  const sentences = splitSentences(text);
  const sentenceLengths = sentences.map(s => s.split(/\s+/).filter(Boolean).length);
  const avgSentenceLength = mean(sentenceLengths);
  const burstiness = avgSentenceLength > 0 ? stdDev(sentenceLengths) / avgSentenceLength : 0;

  const tokens = tokenize(text);
  const totalTokens = tokens.length || 1;
  const unique = new Set(tokens);
  const vocabDiversity = unique.size / totalTokens;

  let aiHits = 0;
  for (const t of tokens) if (AI_VOCAB.has(t)) aiHits++;
  const aiVocabRate = (aiHits / totalTokens) * 100;

  const lower = text.toLowerCase();
  const aiPhraseHits = AI_PHRASES.filter(p => lower.includes(p)).length;

  const emDashCount = (text.match(/—/g) ?? []).length + (text.match(/–/g) ?? []).length;

  const fragmentCount = sentenceLengths.filter(l => l < 6).length;
  const shortSentenceRate = sentences.length ? sentenceLengths.filter(l => l < 8).length / sentences.length : 0;
  const longSentenceRate = sentences.length ? sentenceLengths.filter(l => l > 35).length / sentences.length : 0;

  const paragraphs = splitParagraphs(text);
  const paragraphLengths = paragraphs.map(p => p.split(/\s+/).filter(Boolean).length);
  const paraMean = mean(paragraphLengths);
  const paragraphLengthCV = paraMean > 0 ? stdDev(paragraphLengths) / paraMean : 0;

  const notXButYHits = (text.match(NOT_X_BUT_Y_RE) ?? []).length
    + (text.match(NOT_X_BUT_Y_RE2) ?? []).length
    + (text.match(NOT_ONLY_BUT_ALSO_RE) ?? []).length;
  const lessMoreHits = (text.match(LESS_X_MORE_Y_RE) ?? []).length;

  // CTA-list closer detection: count consecutive imperative sentences in last paragraph.
  // Also check second-to-last in case CTA is split across paragraphs.
  let ctaCloserImperatives = 0;
  if (paragraphs.length > 0) {
    const tailParas = paragraphs.slice(-2);
    for (const para of tailParas) {
      const lastSentences = splitSentences(para);
      for (const s of lastSentences) {
        const len = s.split(/\s+/).filter(Boolean).length;
        if (len <= 12 && IMPERATIVE_OPENERS.test(s.trim())) ctaCloserImperatives++;
      }
    }
  }

  // Rhetorical question fragments: short questions (<8 words) ending in ?
  // AI uses these as setup-punchline rhythm. Humans rarely do.
  let rhetoricalQuestions = 0;
  for (const s of sentences) {
    if (!s.trim().endsWith('?')) continue;
    const len = s.split(/\s+/).filter(Boolean).length;
    if (len < 8) rhetoricalQuestions++;
  }

  // Subject-drop fragments: sentences starting with a verb (no subject pronoun).
  // "Sits in most kitchens.", "Gets used interchangeably." — LLM-faux-casual.
  const VERB_OPENER = /^(sits?|gets?|takes?|makes?|comes?|goes?|stays?|works?|hits?|seems?|looks?|feels?|tastes?|costs?|matters?|counts?|adds?|brings?|helps?|holds?|keeps?|leaves?|drops?|stops?|starts?|reaches?|stands?|sets?|lets?|tells?|shows?|gives?|wants?|needs?|tries?|loses?|fits?|catches?|finds?|hangs?|sticks?|reads?)\b/i;
  let subjectDropFragments = 0;
  for (const s of sentences) {
    const trimmed = s.trim();
    const len = trimmed.split(/\s+/).filter(Boolean).length;
    if (len < 15 && VERB_OPENER.test(trimmed)) subjectDropFragments++;
  }

  // Emphatic single-sentence paragraphs: 1 sentence, under 8 words.
  let emphaticSingleSentenceParas = 0;
  for (const p of paragraphs) {
    const sList = splitSentences(p);
    if (sList.length === 1) {
      const wc = sList[0].split(/\s+/).filter(Boolean).length;
      if (wc < 8) emphaticSingleSentenceParas++;
    }
  }

  return {
    burstiness,
    avgSentenceLength,
    vocabDiversity,
    aiVocabRate,
    aiPhraseHits,
    emDashCount,
    fragmentCount,
    shortSentenceRate,
    longSentenceRate,
    paragraphLengthCV,
    notXButYHits,
    lessMoreHits,
    ctaCloserImperatives,
    rhetoricalQuestions,
    subjectDropFragments,
    emphaticSingleSentenceParas,
  };
}

// Score = weighted penalties. Lower component = less AI tell.
// Tuned against the user's 96% GPTZero sample (high em-dash, low burstiness, formulaic).
export function scoreText(text: string): AIScore {
  const b = analyze(text);
  const reasons: string[] = [];
  let score = 0;

  // Burstiness: GPTZero's primary signal. Colin's articles ~0.65-0.85. AI ~0.35-0.55.
  if (b.burstiness < 0.45) { score += 25; reasons.push(`Burstiness ${b.burstiness.toFixed(2)} too low (target >0.6)`); }
  else if (b.burstiness < 0.55) { score += 15; reasons.push(`Burstiness ${b.burstiness.toFixed(2)} below target`); }
  else if (b.burstiness < 0.6) { score += 7; }

  // Avg sentence length: AI clusters around 22-25 words.
  if (b.avgSentenceLength > 19 && b.avgSentenceLength < 27) {
    score += 10; reasons.push(`Avg sentence length ${b.avgSentenceLength.toFixed(1)} in AI sweet spot`);
  } else if (b.avgSentenceLength > 18 && b.avgSentenceLength < 28) {
    score += 5;
  }

  // Short sentence rate: humans use fragments. AI rarely does.
  if (b.shortSentenceRate < 0.05) { score += 15; reasons.push(`Only ${(b.shortSentenceRate * 100).toFixed(0)}% short sentences (need >15%)`); }
  else if (b.shortSentenceRate < 0.1) { score += 10; reasons.push(`${(b.shortSentenceRate * 100).toFixed(0)}% short sentences (need >15%)`); }
  else if (b.shortSentenceRate < 0.15) { score += 5; }

  // Long sentence rate: humans break the rhythm with sprawling sentences.
  if (b.longSentenceRate < 0.03) { score += 8; reasons.push(`No long sentences (need at least one >35 words)`); }
  else if (b.longSentenceRate < 0.06) { score += 4; }

  // Em dashes: GPTZero flags them as AI signature. Strict penalty.
  if (b.emDashCount > 5) { score += 15; reasons.push(`${b.emDashCount} em/en dashes (target 0)`); }
  else if (b.emDashCount > 2) { score += 10; reasons.push(`${b.emDashCount} em/en dashes (target 0)`); }
  else if (b.emDashCount > 0) { score += 5; reasons.push(`${b.emDashCount} em/en dashes`); }

  // AI vocab rate: hits per 100 words.
  if (b.aiVocabRate > 1.5) { score += 12; reasons.push(`AI vocab rate ${b.aiVocabRate.toFixed(2)}/100 words`); }
  else if (b.aiVocabRate > 0.8) { score += 6; reasons.push(`AI vocab rate ${b.aiVocabRate.toFixed(2)}/100 words`); }
  else if (b.aiVocabRate > 0.3) { score += 2; }

  // AI phrase hits.
  if (b.aiPhraseHits > 3) { score += 12; reasons.push(`${b.aiPhraseHits} banned AI phrases present`); }
  else if (b.aiPhraseHits > 1) { score += 6; reasons.push(`${b.aiPhraseHits} banned AI phrases present`); }
  else if (b.aiPhraseHits > 0) { score += 3; }

  // Vocab diversity: AI under-diverse on long texts.
  if (b.vocabDiversity < 0.4) { score += 5; }
  else if (b.vocabDiversity < 0.45) { score += 2; }

  // Paragraph length CV: AI tends to write uniform paragraphs.
  if (b.paragraphLengthCV < 0.15) { score += 8; reasons.push(`Paragraph lengths too uniform (CV ${b.paragraphLengthCV.toFixed(2)})`); }
  else if (b.paragraphLengthCV < 0.25) { score += 4; }

  // "Not X, but Y" rhetorical pattern.
  if (b.notXButYHits > 0) { score += 8 * Math.min(b.notXButYHits, 3); reasons.push(`${b.notXButYHits} "not X, but Y" pattern(s)`); }

  // "Less X, more Y" sensory parallel.
  if (b.lessMoreHits > 0) { score += 5 * Math.min(b.lessMoreHits, 3); reasons.push(`${b.lessMoreHits} "less X, more Y" pattern(s)`); }

  // CTA-list closer: 3+ short imperatives in last paragraph.
  if (b.ctaCloserImperatives >= 3) { score += 15; reasons.push(`CTA-list closer (${b.ctaCloserImperatives} consecutive imperatives)`); }
  else if (b.ctaCloserImperatives >= 2) { score += 8; }

  // Rhetorical question chains: AI uses short setup-questions repeatedly.
  if (b.rhetoricalQuestions >= 3) { score += 12; reasons.push(`${b.rhetoricalQuestions} rhetorical question fragments (target ≤1)`); }
  else if (b.rhetoricalQuestions >= 2) { score += 6; reasons.push(`${b.rhetoricalQuestions} rhetorical question fragments`); }

  // Subject-drop fragments stacked: "Sits in...", "Gets used...", "Takes X..."
  if (b.subjectDropFragments >= 5) { score += 10; reasons.push(`${b.subjectDropFragments} subject-drop fragments (performative casual)`); }
  else if (b.subjectDropFragments >= 3) { score += 5; reasons.push(`${b.subjectDropFragments} subject-drop fragments`); }

  // Excess single-sentence emphatic paragraphs: classic AI "emphasis trick".
  if (b.emphaticSingleSentenceParas >= 4) { score += 10; reasons.push(`${b.emphaticSingleSentenceParas} single-sentence emphatic paragraphs (target ≤2)`); }
  else if (b.emphaticSingleSentenceParas >= 3) { score += 5; reasons.push(`${b.emphaticSingleSentenceParas} single-sentence emphatic paragraphs`); }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const label = score >= 60 ? "ai" : score >= 35 ? "borderline" : "human";

  return { score, label, breakdown: b, reasons };
}

// Async scorer: heuristic + real perplexity from OpenRouter.
// Falls back to heuristic-only if perplexity API fails.
export async function scoreTextWithPerplexity(text: string): Promise<AIScore> {
  const heuristic = scoreText(text);
  const ppl = await computePerplexity(text);
  if (!ppl) return heuristic;

  const { points, reason } = perplexityScore(ppl.perplexity);
  const combinedScore = Math.max(0, Math.min(100, heuristic.score + points));
  const label = combinedScore >= 60 ? "ai" : combinedScore >= 35 ? "borderline" : "human";

  const reasons = [...heuristic.reasons];
  if (reason) reasons.unshift(reason);

  return {
    score: combinedScore,
    label,
    breakdown: { ...heuristic.breakdown, perplexity: ppl.perplexity },
    reasons,
  };
}
