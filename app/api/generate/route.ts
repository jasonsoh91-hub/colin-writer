import { NextRequest } from 'next/server';
import { generateArticle } from '@/lib/generator';
import { research } from '@/lib/research';
import { stripColinSlips, type StripReport } from '@/lib/colin-strip';
import { computeSimilarity } from '@/lib/analyzer';
import { logTrainingRun } from '@/lib/training-log';

export const runtime = 'nodejs';
export const maxDuration = 120;  // Research adds ~15-25s before LLM call

// Personas that should auto-research via Tavily when no manual source notes given.
// Colin stays manual-only because his pipeline already has feedback/taxonomy/skeletons.
const AUTO_RESEARCH_PERSONAS = new Set(['cnn-travel', 'editor-c']);

export async function POST(req: NextRequest) {
  const { topic, options, personaId } = await req.json();

  if (!topic?.trim()) {
    return new Response(JSON.stringify({ error: 'Topic is required' }), { status: 400 });
  }

  const persona = personaId ?? 'colin';
  const opts = { ...(options ?? {}) };

  // Auto-research: if CNN persona and no manual source notes, fetch real
  // articles via Tavily, inject as source notes so the model uses real
  // names/stats/quotes instead of fabricating them.
  const usedAutoResearch =
    AUTO_RESEARCH_PERSONAS.has(persona) &&
    !opts.sourceNotes?.trim() &&
    !!process.env.TAVILY_API_KEY;

  const researchSources: { url: string; title: string }[] = [];
  if (usedAutoResearch) {
    const result = await research(topic.trim(), 3);
    if (result && result.sources.length > 0) {
      opts.sourceNotes = result.factsBlock;
      for (const s of result.sources) researchSources.push({ url: s.url, title: s.title });
    }
  }

  const rawStream = await generateArticle(topic.trim(), opts, persona);

  const headers: Record<string, string> = {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-cache',
  };
  if (researchSources.length > 0) {
    headers['X-Research-Sources'] = encodeURIComponent(JSON.stringify(researchSources));
    headers['Access-Control-Expose-Headers'] = (headers['Access-Control-Expose-Headers'] ?? '') + 'X-Research-Sources, ';
  }

  // For Colin: buffer full output server-side, run deterministic slip-strip,
  // then send as a single chunk. Loses streaming "typewriter" UX but produces
  // the same clean output as the CLI iteration harness.
  // Non-Colin personas keep streaming — their pipeline doesn't share strip rules.
  if (persona === 'colin') {
    const reader = (rawStream as ReadableStream).getReader();
    const decoder = new TextDecoder();
    let raw = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      raw += decoder.decode(value, { stream: true });
    }
    const stripReport: StripReport = { removedSentences: [], prefixStrippedSentences: [], swapsApplied: 0 };
    const polished = stripColinSlips(raw, stripReport);

    // Log this run to Supabase for the /training dashboard. Fire-and-forget —
    // metrics-sink failure must not break the user's generation.
    try {
      const sim = await computeSimilarity(polished);
      logTrainingRun({
        topic: topic.trim(),
        persona,
        genre: opts.genre ?? null,
        wordCount: sim.article.wordCount,
        rawWordCount: raw.split(/\s+/).filter(Boolean).length,
        textStyleScore: sim.textStyleScore,
        metrics: sim.article,
        droppedSentenceCount: stripReport.removedSentences.length,
        prefixStrippedCount: stripReport.prefixStrippedSentences.length,
        articleText: polished,
        metadata: { hasResearch: researchSources.length > 0 },
      }).catch(() => {});
    } catch {
      // analyzer failure shouldn't break the response either
    }

    if (stripReport.removedSentences.length || stripReport.prefixStrippedSentences.length) {
      headers['X-Strip-Report'] = encodeURIComponent(JSON.stringify({
        dropped: stripReport.removedSentences.length,
        prefixStripped: stripReport.prefixStrippedSentences.length,
      }));
      headers['Access-Control-Expose-Headers'] = (headers['Access-Control-Expose-Headers'] ?? '') + 'X-Strip-Report';
    }
    return new Response(polished, { headers });
  }

  headers['Transfer-Encoding'] = 'chunked';
  return new Response(rawStream, { headers });
}
