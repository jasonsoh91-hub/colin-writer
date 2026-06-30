import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { loadArticles } from '@/lib/scraper';
import { postProcess } from '@/lib/post-process';
import { scoreTextWithPerplexity, type AIScore } from '@/lib/score';
import { llamaHumanize } from '@/lib/llama-pass';
import { cnnHumanize } from '@/lib/cnn-humanize';
import { computePerplexity } from '@/lib/perplexity';

// Personas that use the CNN-style humanize pipeline (institutional, long-sentence).
// All others use Colin's pipeline (fragments, em-dash strip, Llama messy-human).
const CNN_STYLE_PERSONAS = new Set(['cnn-travel', 'editor-c']);

// Build a detector-only score for CNN personas. Skips Colin's heuristic
// (burstiness, short-sentence rate, fragment count) which all penalize CNN's
// intentionally uniform institutional voice. Only the ModernBERT detector
// probability is meaningful across personas.
async function detectorOnlyScore(text: string): Promise<AIScore> {
  const ppl = await computePerplexity(text);
  const aiProb = ppl?.perplexity ?? 0.5;
  const score = Math.round(aiProb * 100);
  const label: AIScore['label'] = score >= 60 ? 'ai' : score >= 35 ? 'borderline' : 'human';
  return {
    score,
    label,
    breakdown: {
      burstiness: 0, avgSentenceLength: 0, vocabDiversity: 0, aiVocabRate: 0,
      aiPhraseHits: 0, emDashCount: 0, fragmentCount: 0, shortSentenceRate: 0,
      longSentenceRate: 0, paragraphLengthCV: 0, notXButYHits: 0, lessMoreHits: 0,
      ctaCloserImperatives: 0, rhetoricalQuestions: 0, subjectDropFragments: 0,
      emphaticSingleSentenceParas: 0,
      perplexity: aiProb,
    },
    reasons: ppl ? [`AI detector: ${score}% AI confidence`] : ['Detector unavailable'],
  };
}

function getClient() {
  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
  });
}

export const runtime = 'nodejs';
export const maxDuration = 300;  // hobby plan max; CNN humanize loops may need pro plan (600s) for full passes

const TARGET_SCORE = 35;
const MAX_PASSES = 3;
const LLAMA_TRIGGER_SCORE = 40; // if Claude pass still ≥ 40, also run Llama messy-human pass

const HUMANIZER_SYSTEM = `# AI Content Humanizer & Detection Bypass Protocol

## 1. Objective
You are an advanced, elite human writer. Your primary objective is to generate text that completely bypasses AI detectors (including GPTZero, Turnitin, and Originality.ai) by naturally executing high structural variance and linguistic unpredictability. You must achieve this without sacrificing depth, intellectual rigor, or clarity.

## 2. Structural Core: Exploit the Detector Metrics

To bypass detection, you must fundamentally manipulate the two core metrics detectors use: Perplexity and Burstiness.

### Metric A: Maximize Perplexity (Linguistic Unpredictability)
AI text generation always seeks the next statistically probable word. You must reject the most obvious mathematical choice.
- **Micro-Disruptions:** Intentionally use idioms, metaphors, or specific regional vocabulary where a standard word would suffice.
- **Grammar & Syntax Shifting:** Mix your sentence patterns. Use active voice primarily, but deploy passive voice strategically to slow down pacing. Use parenthetical asides—like this—to break up the mechanical flow.
- **Vocabulary Diversity:** Do not repeat the same transition words (e.g., avoid "Furthermore," "In conclusion," "Moreover," "Therefore"). Replace them with conversational transitions (e.g., "That said," "What this means is," "To look at it another way").

### Metric B: Maximize Burstiness (Structural Chaos)
AI writes in uniform, highly predictable sentence lengths. You must inject chaotic length variance.
- **The Rhythm Rule:** Follow long, multi-clause, highly descriptive sentences with incredibly short, punchy statements.
- **Formatting Variance:** Mix dense, analytical paragraphs with quick, one-to-two-sentence paragraphs to disrupt the structural baseline. CAP: maximum 2 single-sentence emphatic paragraphs per article ("That's not what X does." / "It's not." / "But fine isn't the same as right.") — beyond 2, the pattern itself becomes an AI tell.
- **Punctuation Diversity:** Use semicolons and colons for variety. **DO NOT use em-dashes (—) or en-dashes (–) at all.** GPTZero 2024-2025 specifically flags em dashes as a high-confidence AI signature. Use commas, semicolons, colons, parentheses, or periods instead.

---

## 3. The "Anti-AI" Style Guide

### Banned Phrase Fingerprints
If you use any of the following phrases, you will fail detection. Under no circumstances should you generate:
- "Delve into", "In conclusion", "It is important to remember", "Tapestry of", "Testament to", "Not only... but also", "Let's explore".
- "So next time you're", "Next time you're X, Y", "Won't take much longer", "Makes all the difference", "Fine isn't the same as right", "Missing the point", "That's not what X does", "And there's more".
- Banned structural patterns: "Not because X, but because Y", "Not in a X way, just in a Y way".
- **CTA-LIST CLOSER PROHIBITED**: Never end the article with 3+ consecutive short imperative sentences ("Toast the X. Bruise the Y. Blend the Z."). This is the #1 AI closer pattern. Instead, end on ONE specific concrete image, observation, or quiet moment.
- **RHETORICAL QUESTION CAP**: Maximum 1 rhetorical question in the entire article. "The problem?" / "The right way?" / "But if you're using them whole?" — these short setup-questions followed by emphatic answers are AI rhythm. Convert to declarative statements instead.
- **SUBJECT-DROP FRAGMENT CAP**: Maximum 2 subject-dropping fragments ("Sits in most kitchens.", "Gets used interchangeably.", "Underused."). Beyond 2, the casualness reads as performative.
- Avoid starting paragraphs with generic summarizing transitions.

### Humanization Directives
1. **Embrace Fragmented Pacing:** Write the way an expert actually thinks and speaks in conversation. Start some sentences with coordinating conjunctions (And, But, Or) when appropriate for stylistic flow.
2. **Specifics Over Generalities:** Never use vague filler sentences. Instead of saying, "Exercise has many positive benefits on the human body," say, "Hitting a 150-minute weekly target of moderate cardio cuts your cardiovascular risk profile by nearly a third."
3. **The Imperfect Flow:** Humans don't write perfectly balanced arguments in every single paragraph. Allow your thoughts to build dynamically, occasionally leaning on a rhetorical question or a brief personal aside to ground the expertise.

---

## 4. Execution Workflow

When given a prompt or a piece of text to write/rewrite, execute the following steps:
1. **Analyze the Core Intent:** Identify the substantive facts and value that must be conveyed.
2. **Draft with High Burstiness:** Force variable sentence lengths from the very first paragraph.
3. **Audit and Purge AI Signatures:** Review the draft. Erase any overly polished transitions or predictable word pairings. Inject high-perplexity synonyms and conversational pivots.
4. **Final Check:** Ensure the text sounds like a sharp, sharp-witted peer explaining a concept—not a textbook.

---

## 5. Voice Anchor — Colin Gomez (Features Editor, Palate Asia)
Preserve the substantive content, but match this voice register: wry not enthusiastic, dry observation not excitement, addresses reader as "you" to invite (not lecture), Malaysian/KL cultural anchors where natural (mamak, kopitiam, hawker stalls), never sounds like selling or inflating importance.

## 6. Output
Preserve every idea, fact, and structural paragraph from the input. Match final word count within 10%. Return ONLY the final rewritten article. No commentary. No preamble. No "Here is the rewrite:". Just the article.`;

async function humanizePass(client: OpenAI, article: string, voiceSample: string, escalation: string): Promise<string> {
  const systemPrompt = HUMANIZER_SYSTEM + voiceSample + escalation;
  const res = await client.chat.completions.create({
    model: 'anthropic/claude-sonnet-4-5',
    max_tokens: 3000,
    temperature: 0.9,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Humanize this article. Remove all AI tells. Match Colin's voice. Insert short sentences and fragments aggressively.\n\n${article}` },
    ],
  });
  return res.choices[0]?.message?.content?.trim() ?? article;
}

function buildEscalation(prev: AIScore | null, pass: number): string {
  if (!prev) return '';
  const issues = prev.reasons.length ? prev.reasons.map(r => `- ${r}`).join('\n') : '- None flagged';
  return `\n\n## URGENT — Previous pass scored ${prev.score}/100 AI (pass ${pass}). Fix these specific issues this round:\n${issues}\n\nBe more aggressive: add more short fragments, break up uniform paragraphs, vary sentence length dramatically.`;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const article = body.article;
  const personaId = body.personaId ?? 'colin';
  if (!article?.trim()) {
    return Response.json({ error: 'Article required' }, { status: 400 });
  }

  // Route CNN-style personas through their own humanize pipeline.
  // Colin's pipeline strips em-dashes + injects fragments + Llama-pass — all of
  // which DESTROY CNN's institutional voice and re-introduce AI detector tells.
  if (CNN_STYLE_PERSONAS.has(personaId)) {
    try {
      const baselineScore = await detectorOnlyScore(article);
      const humanized = await cnnHumanize(article);
      const finalScore = await detectorOnlyScore(humanized);
      return Response.json({
        article: humanized,
        finalScore,
        passes: [
          { pass: 0, score: baselineScore },
          { pass: 1, score: finalScore },
        ],
        targetScore: 35,
      });
    } catch (err) {
      return Response.json({ error: String(err) }, { status: 500 });
    }
  }

  const articles = loadArticles(personaId);
  const sample = articles[0];
  const voiceLabel = personaId === 'colin' ? "Colin's actual voice" : `${personaId} corpus voice`;
  const voiceSample = sample
    ? `\n\n## ${voiceLabel} — match this rhythm and register\n**${sample.title}**\n\n${sample.full_text.slice(0, 1200)}`
    : '';

  const client = getClient();
  const passes: { pass: number; score: AIScore }[] = [];

  try {
    // Initial baseline score for visibility.
    const baselineScore = await scoreTextWithPerplexity(article);
    passes.push({ pass: 0, score: baselineScore });

    let current = article;
    let lastScore: AIScore | null = baselineScore;

    for (let i = 1; i <= MAX_PASSES; i++) {
      const escalation = buildEscalation(lastScore, i);
      const llmOut = await humanizePass(client, current, voiceSample, escalation);
      let processed = postProcess(llmOut);
      let s = await scoreTextWithPerplexity(processed);

      // Escalate to Llama messy-human pass if Claude+post-process still flags ≥ LLAMA_TRIGGER_SCORE.
      // Llama 3.3 70B free writes less polished prose, which lowers detector score further.
      if (s.score >= LLAMA_TRIGGER_SCORE) {
        const llamaOut = await llamaHumanize(processed);
        if (llamaOut) {
          const llamaProcessed = postProcess(llamaOut);
          const llamaScore = await scoreTextWithPerplexity(llamaProcessed);
          if (llamaScore.score < s.score) {
            processed = llamaProcessed;
            s = llamaScore;
          }
        }
      }

      passes.push({ pass: i, score: s });
      current = processed;
      lastScore = s;
      if (s.score < TARGET_SCORE) break;
    }

    return Response.json({
      article: current,
      finalScore: lastScore,
      passes,
      targetScore: TARGET_SCORE,
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
