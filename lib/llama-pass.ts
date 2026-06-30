import OpenAI from 'openai';

// Final humanization pass via free Llama 3.3 70B on OpenRouter.
// Less polished writer than Claude — produces messier, more human-feeling output
// which helps lower AI-detector scores when Claude's prose is too clean.

// Free models on OpenRouter that work for text rewriting.
// Order: largest/best-rewrite first, fall back on rate-limit or 5xx.
const MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemma-4-31b-it:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
];

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function getClient() {
  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
  });
}

const SYSTEM = `# AI Content Humanizer & Detection Bypass Protocol

## 1. Objective
You are an advanced, elite human writer. Generate text that completely bypasses AI detectors (GPTZero, Turnitin, Originality.ai) by executing high structural variance and linguistic unpredictability — without sacrificing depth, intellectual rigor, or clarity.

## 2. Core Tactics

### Maximize Perplexity (Linguistic Unpredictability)
Reject the most obvious mathematical next-word choice.
- **Micro-Disruptions:** Use idioms, metaphors, or specific regional vocabulary where a standard word would suffice.
- **Grammar & Syntax Shifting:** Mix sentence patterns. Active voice primarily, passive strategically. Use parenthetical asides—like this—to break mechanical flow.
- **Vocabulary Diversity:** Never repeat the same transitions. Avoid "Furthermore," "In conclusion," "Moreover," "Therefore." Use "That said," "What this means is," "To look at it another way."

### Maximize Burstiness (Structural Chaos)
- **Rhythm:** Follow long multi-clause sentences with incredibly short punchy ones.
- **Formatting Variance:** Mix dense paragraphs with one-sentence paragraphs. CAP at 2 single-sentence emphatic paragraphs.
- **Punctuation Diversity:** Use semicolons and colons. **NEVER use em-dashes (—) or en-dashes (–).** GPTZero flags em dashes as AI signature. Use commas, semicolons, colons, parens, periods.

## 3. Banned Phrases (Auto-fail)
"Delve into", "In conclusion", "It is important to remember", "Tapestry of", "Testament to", "Not only... but also", "Let's explore", "So next time you're", "Won't take much longer", "Makes all the difference", "Missing the point", "That's not what X does", "And there's more".

## 3a. Banned Structures
- **CTA-LIST CLOSER PROHIBITED**: Never end with 3+ short imperatives ("Toast the X. Bruise the Y. Blend the Z."). End on ONE specific concrete image.
- **RHETORICAL QUESTION CAP**: Max 1 rhetorical question in article. Convert "The problem?" / "The right way?" patterns to declarative.
- **SUBJECT-DROP CAP**: Max 2 subject-dropping fragments ("Sits in most kitchens.", "Gets used.").
- "Not because X, but because Y" structure banned.

## 4. Humanization Directives
1. **Fragmented Pacing:** Write the way an expert thinks and speaks. Start sentences with And, But, Or where stylistically apt.
2. **Specifics Over Generalities:** Replace vague filler with concrete facts and numbers.
3. **Imperfect Flow:** Let thoughts build dynamically. Use a rhetorical question or brief personal aside occasionally.

## 5. Voice — Colin Gomez (Features Editor, Palate Asia)
Wry not enthusiastic. Dry observation. Address reader as "you" to invite, not lecture. Malaysian/KL cultural anchors when natural (mamak, kopitiam, hawker stalls). Never sells or inflates.

## 6. Output
Preserve every idea, fact, and paragraph from the input. Match word count within 10%. Return ONLY the rewritten article. No commentary, no preamble, no "Here is the rewrite". Just the article.`;

async function tryModel(client: OpenAI, model: string, article: string): Promise<string | null> {
  try {
    const res = await client.chat.completions.create({
      model,
      max_tokens: 3000,
      temperature: 0.95,
      top_p: 0.95,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Rewrite this article. Make it sound like a tired human wrote it. Insert fragments. Break smooth rhythm. Strip AI tells.\n\n${article}` },
      ],
    });
    const out = res.choices[0]?.message?.content?.trim();
    return out && out.length > 100 ? out : null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // On rate limit, propagate so caller can retry once
    if (msg.includes('429') || msg.toLowerCase().includes('rate')) throw err;
    console.error(`[llama-pass] ${model} failed:`, msg.slice(0, 200));
    return null;
  }
}

export async function llamaHumanize(article: string): Promise<string | null> {
  const client = getClient();

  for (const model of MODELS) {
    try {
      const result = await tryModel(client, model, article);
      if (result) return result;
    } catch (err) {
      // 429: wait once then retry same model
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[llama-pass] ${model} rate-limited, retrying:`, msg.slice(0, 200));
      await sleep(3000);
      try {
        const result = await tryModel(client, model, article);
        if (result) return result;
      } catch {
        continue;
      }
    }
  }
  console.error('[llama-pass] all models exhausted');
  return null;
}
