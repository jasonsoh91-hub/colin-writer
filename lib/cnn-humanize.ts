// Max-bypass humanize pipeline (v4).
//
// USER DECISION: prioritize detector bypass over CNN voice fidelity.
// Voice WILL drift toward "tired blogger" register. Facts/names/quotes preserved.
//
// Techniques implemented (from user's bypass spec):
//   1. Perplexity injection — rare-synonym substitution
//   2. Burstiness forcing — split long sentences, vary lengths
//   3. Syntactic restructuring — via high-temp LLM pass
//   4. Anti-pattern blacklist — strip AI words + em-dashes
//   5. Punctuation humanization — light variant
//   7. Multi-pass pipeline — chain all steps
//   8. Detector-in-the-loop — iterate via ModernBERT scoring
//
// Skipped:
//   6. Homoglyph injection (dying technique, newer detectors strip)
//   9. Style transfer (handled via #3 prompt instructions)
//  10. Adversarial training (out of scope — requires fine-tuning)

import OpenAI from 'openai';
import { computePerplexity } from './perplexity';

const TARGET_MODERN_BERT = 35;
const MAX_HUMANIZE_PASSES = 5;

function getClient() {
  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
  });
}

// Different model families for rotation. Each pass uses next in list.
const PARAPHRASE_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'google/gemma-4-31b-it:free',
];

// ─────────────────────────────────────────────────────────────────────────────
// Technique #1: Perplexity Injection — rare synonym swap
// ─────────────────────────────────────────────────────────────────────────────

// AI-typical word → array of lower-probability human alternatives.
// Random pick from alternatives = "bottom 30% of probability distribution" effect.
// Empty string = strip word entirely.
const RARE_SYNONYMS: Record<string, string[]> = {
  utilize: ['use', 'lean on', 'fall back to', 'go with'],
  utilizes: ['uses', 'leans on'],
  utilizing: ['using', 'leaning on'],
  however: ['but', 'though', 'still', 'mind you'],
  moreover: ['plus', 'also', 'on top of that'],
  furthermore: ['also', 'plus', 'and another thing'],
  additionally: ['plus', 'also', 'and'],
  delve: ['dig into', 'get into', 'look at'],
  delves: ['digs into', 'gets into'],
  delving: ['digging into', 'getting into'],
  tapestry: ['mix', 'jumble', 'patchwork'],
  navigate: ['handle', 'deal with', 'work through'],
  navigating: ['handling', 'dealing with'],
  navigates: ['handles', 'deals with'],
  crucial: ['key', 'big', 'real'],
  pivotal: ['key', 'big', 'central'],
  leverage: ['use', 'rely on', 'tap'],
  leveraging: ['using', 'relying on'],
  leverages: ['uses', 'relies on'],
  robust: ['solid', 'tough', 'strong'],
  seamless: ['smooth', 'clean'],
  seamlessly: ['smoothly', 'cleanly'],
  embark: ['start', 'kick off', 'begin'],
  embarks: ['starts', 'kicks off'],
  embarking: ['starting', 'kicking off'],
  foster: ['build', 'grow', 'help'],
  fostering: ['building', 'growing'],
  underscore: ['show', 'point to'],
  underscores: ['shows', 'points to'],
  underscoring: ['showing', 'pointing to'],
  landscape: ['scene', 'world', 'space'],
  realm: ['world', 'space', 'corner'],
  journey: ['trip', 'path', 'route', 'ride'],
  intricate: ['complex', 'tangled', 'detailed'],
  multifaceted: ['mixed', 'layered'],
  therefore: ['so', 'which means'],
  consequently: ['so', 'which means'],
  subsequently: ['later', 'after'],
  numerous: ['many', 'a lot of', 'plenty of'],
  various: ['different', 'lots of', 'mixed'],
  myriad: ['many', 'a lot of'],
  plethora: ['lots', 'plenty'],
  vibrant: ['alive', 'busy', 'loud'],
  bustling: ['busy', 'packed'],
  renowned: ['well-known', 'famous'],
  groundbreaking: ['new', 'fresh'],
  breathtaking: ['striking', 'stunning'],
  showcasing: ['showing', 'putting on display'],
  showcase: ['show', 'display'],
  testament: ['proof', 'sign'],
  passionate: ['serious', 'committed'],
  dedicated: ['focused', 'committed'],
  // Strip-and-clean — empty = removed entirely
  'in conclusion': [''],
  'it is worth noting': [''],
  'it should be noted': [''],
  "it's worth noting": [''],
  'in essence': [''],
  'in summary': [''],
  'at the end of the day': ['ultimately', ''],
  'needless to say': [''],
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function perplexityInjection(text: string): string {
  let out = text;
  for (const [word, alternatives] of Object.entries(RARE_SYNONYMS)) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escaped}\\b`, 'gi');
    out = out.replace(pattern, () => pickRandom(alternatives));
  }
  // Clean up double spaces and orphan punctuation from stripped phrases
  out = out.replace(/[ \t]{2,}/g, ' ');
  out = out.replace(/\s+([.,;!?])/g, '$1');
  out = out.replace(/\(\s*\)/g, '');
  out = out.replace(/,\s*,/g, ',');
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Technique #4: Strip em/en dashes (GPTZero tell #1)
// ─────────────────────────────────────────────────────────────────────────────

export function stripDashes(text: string): string {
  let out = text;
  out = out.replace(/\s*—\s*([A-Z])/g, '. $1');
  out = out.replace(/\s*—\s*/g, ', ');
  out = out.replace(/\s*–\s*/g, ', ');
  out = out.replace(/,\s*,/g, ',');
  out = out.replace(/\.\s*,/g, '.');
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Technique #2: Burstiness forcing — measure σ, force variation
// ─────────────────────────────────────────────────────────────────────────────

function splitSentences(p: string): string[] {
  return p.split(/(?<=[.!?])\s+(?=[A-Z"'])/);
}

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

export function burstinessForce(text: string): string {
  const paragraphs = text.split(/\n\s*\n/);
  const processed = paragraphs.map(para => {
    if (!para.trim() || para.startsWith('#')) return para;

    const sentences = splitSentences(para);
    if (sentences.length < 3) return para;

    const lengths = sentences.map(wordCount);
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((sum, l) => sum + (l - mean) ** 2, 0) / lengths.length;
    const sigma = Math.sqrt(variance);
    const cv = mean > 0 ? sigma / mean : 0;  // coefficient of variation

    // If burstiness too low, split a long sentence at a clause boundary
    if (cv < 0.4) {
      for (let i = 0; i < sentences.length; i++) {
        if (wordCount(sentences[i]) > 20) {
          // Try to split at ", and " / ", but " / ", so " / "; "
          const splitPatterns = [
            /,\s+(and|but|so|yet|although|while)\s+/i,
            /;\s+/,
          ];
          for (const pat of splitPatterns) {
            const match = sentences[i].search(pat);
            if (match > 0) {
              const before = sentences[i].slice(0, match).trim();
              const after = sentences[i].slice(match).replace(pat, '').trim();
              if (before.length > 10 && after.length > 10) {
                const afterCap = after.charAt(0).toUpperCase() + after.slice(1);
                sentences[i] = before.replace(/[,;]$/, '') + '. ' + afterCap;
                break;
              }
            }
          }
          break;
        }
      }
    }

    return sentences.join(' ');
  });

  return processed.join('\n\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Technique #3: Aggressive LLM restructure (high temp, freq penalty)
// ─────────────────────────────────────────────────────────────────────────────

const MAX_BYPASS_SYSTEM = `You are humanizing AI-generated text to defeat AI detectors. Rewrite aggressively. Voice fidelity is SECONDARY to detector bypass.

## Mandatory rewrite operations
1. Replace ALL em-dashes (—) and en-dashes (–) with commas, periods, or parentheses.
2. Mix sentence lengths AGGRESSIVELY. Some sentences must be under 6 words. Some over 30 words. NEVER three sentences of similar length back-to-back.
3. Insert contractions everywhere: "do not" → "don't", "it is" → "it's", "cannot" → "can't", "they are" → "they're", "you will" → "you'll".
4. Start some sentences with coordinating conjunctions: "And", "But", "Or", "So", "Yet".
5. Add hedging where natural: "kind of", "sort of", "I guess", "more or less", "pretty much".
6. Add discourse markers occasionally: "anyway", "so yeah", "look", "honestly", "mind you", "still".
7. Convert some passive to active, some active to passive — mix it up.
8. Use sentence fragments. On purpose. Like this.
9. STRIP these words/phrases entirely: delve, tapestry, navigate, crucial, pivotal, leverage, robust, seamless, embark, foster, underscore, moreover, furthermore, additionally, "in conclusion", "it's worth noting", landscape, realm, journey, intricate, multifaceted, vibrant, bustling, renowned, groundbreaking, breathtaking, showcase, testament.
10. Keep ALL facts, names, organizations, statistics, and quoted speech EXACT.

## Output
Return ONLY the rewritten article. No commentary. No preamble. No meta-text.`;

async function tryRestructure(client: OpenAI, model: string, article: string): Promise<string | null> {
  try {
    const res = await client.chat.completions.create({
      model,
      max_tokens: 4000,
      temperature: 1.1,        // Above 1.0 = rare-token selection
      top_p: 0.95,
      frequency_penalty: 0.8,  // Penalize repeated token use
      presence_penalty: 0.3,
      messages: [
        { role: 'system', content: MAX_BYPASS_SYSTEM },
        { role: 'user', content: article },
      ],
    });
    const out = res.choices[0]?.message?.content?.trim();
    return out && out.length > 200 ? out : null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('429') || msg.toLowerCase().includes('rate')) throw err;
    console.error(`[max-bypass] ${model} restructure failed:`, msg.slice(0, 150));
    return null;
  }
}

async function restructurePass(client: OpenAI, article: string, model: string): Promise<string | null> {
  try {
    return await tryRestructure(client, model, article);
  } catch (err) {
    // Rate limit — wait + one retry
    await new Promise(r => setTimeout(r, 2500));
    try {
      return await tryRestructure(client, model, article);
    } catch { return null; }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Technique #7: Multi-pass pipeline — chain all transforms
// ─────────────────────────────────────────────────────────────────────────────

async function singleFullPass(client: OpenAI, article: string, model: string): Promise<string | null> {
  // Step A: LLM aggressive restructure (high-temp, freq-penalty)
  const restructured = await restructurePass(client, article, model);
  if (!restructured) return null;

  // Step B: deterministic perplexity injection (rare synonym swap)
  let out = perplexityInjection(restructured);

  // Step C: strip em/en dashes (detector tell #1)
  out = stripDashes(out);

  // Step D: burstiness forcing (split uniform-length runs)
  out = burstinessForce(out);

  // Cleanup whitespace
  out = out.replace(/\n{3,}/g, '\n\n').trim();
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Technique #8: Detector-in-the-loop — iterate, keep best
// ─────────────────────────────────────────────────────────────────────────────

export async function cnnHumanize(article: string): Promise<string> {
  const client = getClient();

  // Baseline
  const baselineProb = (await computePerplexity(article))?.perplexity ?? 0.5;
  let bestArticle = article;
  let bestScore = Math.round(baselineProb * 100);
  console.log(`[max-bypass] baseline ModernBERT: ${bestScore}`);

  let passesRun = 0;
  for (const model of PARAPHRASE_MODELS) {
    if (passesRun >= MAX_HUMANIZE_PASSES) break;
    passesRun++;

    const candidate = await singleFullPass(client, bestArticle, model);
    if (!candidate) {
      console.log(`[max-bypass] pass ${passesRun} (${model}) — model failed, skipping`);
      continue;
    }

    const probResult = await computePerplexity(candidate);
    const score = Math.round((probResult?.perplexity ?? 0.5) * 100);
    console.log(`[max-bypass] pass ${passesRun} (${model}) → ${score} (best: ${bestScore})`);

    if (score < bestScore) {
      bestArticle = candidate;
      bestScore = score;
    }

    if (bestScore < TARGET_MODERN_BERT) {
      console.log(`[max-bypass] target hit (${bestScore} < ${TARGET_MODERN_BERT}) — stopping early`);
      break;
    }
  }

  console.log(`[max-bypass] final ModernBERT: ${bestScore} after ${passesRun} pass(es)`);
  return bestArticle;
}

// Kept for /api/humanize import compat (called by route's CNN branch externally)
export function cnnPostProcess(text: string): string {
  let out = perplexityInjection(text);
  out = stripDashes(out);
  out = burstinessForce(out);
  return out.replace(/\n{3,}/g, '\n\n').trim();
}
