// Local AI detection via ModernBERT-base AI detector (ONNX).
// First call downloads model + caches to disk. Subsequent calls reuse.
// Pure local — no API, no rate limits, no cost.

export interface PerplexityResult {
  perplexity: number; // legacy name kept for compat — actually AI-prob 0-1 scaled
  avgLogProb: number; // logit
  tokenCount: number;
}

// ModernBERT-base AI detector — trained on AI vs human text classification.
// Requires @huggingface/transformers v3+ for ModernBERT support.
const MODEL_ID = 'onnx-community/answerdotai-ModernBERT-base-ai-detector-ONNX';

let pipelinePromise: Promise<(text: string, opts?: object) => Promise<Array<{ label: string; score: number }>>> | null = null;

async function getDetector() {
  if (pipelinePromise) return pipelinePromise;
  pipelinePromise = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');
    env.allowLocalModels = false;
    env.useBrowserCache = false;
    const detector = await pipeline('text-classification', MODEL_ID, { dtype: 'q8' });
    return detector as never;
  })();
  return pipelinePromise;
}

// Split text into overlapping chunks of ~CHUNK_CHARS characters at paragraph boundaries.
// The detector verdict varies with input length; chunking + max-confidence catches
// AI-tells in any segment instead of averaging them out across a long article.
const CHUNK_CHARS = 1200;
const CHUNK_OVERLAP = 200;

function chunkText(text: string): string[] {
  if (text.length <= CHUNK_CHARS) return [text];
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + CHUNK_CHARS, text.length);
    if (end < text.length) {
      // Try to break at paragraph or sentence boundary
      const lastPara = text.lastIndexOf('\n\n', end);
      const lastSentence = text.lastIndexOf('. ', end);
      if (lastPara > i + CHUNK_CHARS / 2) end = lastPara;
      else if (lastSentence > i + CHUNK_CHARS / 2) end = lastSentence + 1;
    }
    chunks.push(text.slice(i, end).trim());
    if (end >= text.length) break;
    i = Math.max(i + 1, end - CHUNK_OVERLAP);
  }
  return chunks.filter(c => c.length > 100);
}

// Returns AI probability 0-1 (max across chunks).
export async function computePerplexity(text: string): Promise<PerplexityResult | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Strip markdown headings and leading title which can confuse the classifier.
  const cleaned = trimmed.replace(/^#{1,6}\s+.+$/gm, '').trim();

  try {
    const detector = await getDetector();
    const chunks = chunkText(cleaned);
    if (!chunks.length) return null;

    const aiLabels = new Set(['ai', 'llm', 'machine', 'generated', 'fake', 'label_1', 'positive', '1']);

    const probs: number[] = [];
    for (const chunk of chunks) {
      const result = await detector(chunk, { top_k: 2 } as object);
      const arr = Array.isArray(result) ? result : [result];
      const flat = arr.flat() as Array<{ label: string; score: number }>;
      const aiEntry = flat.find(r => aiLabels.has(r.label.toLowerCase()));
      const humanEntry = flat.find(r => !aiLabels.has(r.label.toLowerCase()));
      const aiProb = aiEntry?.score ?? (humanEntry ? 1 - humanEntry.score : 0.5);
      probs.push(aiProb);
    }


    // Average across chunks. Max is too strict (false positives on long human text),
    // median underweights problematic sections. Mean balances both.
    const avgAiProb = probs.reduce((a, b) => a + b, 0) / probs.length;

    return {
      perplexity: avgAiProb,
      avgLogProb: Math.log(Math.max(avgAiProb, 1e-9)),
      tokenCount: cleaned.length,
    };
  } catch (err) {
    console.error('[ai-detector] error:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

// Map AI probability (0-1) to score contribution.
export function perplexityScore(aiProb: number): { points: number; reason: string | null } {
  const pct = Math.round(aiProb * 100);
  if (aiProb > 0.9)  return { points: 50, reason: `AI detector: ${pct}% AI confidence (very high)` };
  if (aiProb > 0.75) return { points: 38, reason: `AI detector: ${pct}% AI confidence (high)` };
  if (aiProb > 0.55) return { points: 22, reason: `AI detector: ${pct}% AI confidence (moderate)` };
  if (aiProb > 0.35) return { points: 10, reason: `AI detector: ${pct}% AI confidence (borderline)` };
  if (aiProb > 0.2)  return { points: 3, reason: `AI detector: ${pct}% AI confidence (low)` };
  return { points: 0, reason: `AI detector: ${pct}% AI confidence (very low)` };
}
