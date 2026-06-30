// Deterministic post-processors that run after LLM output.
// Pure regex — no model calls, no rate limits, always enforced.

// Sentences containing any of these phrases are dropped entirely.
// Source: lib/analyzer.ts GENERIC_PHRASES + humanize system prompt ban list.
const BANNED_SENTENCE_PHRASES = [
  "let's get into it", "let's dive in", "let's explore",
  "here's the thing", "the thing is",
  "picture this", "imagine this",
  "that's what happens when",
  "to be fair",
  "that has to count for something",
  "none of this is to say", "none of this is to suggest",
  "i'm not claiming", "i'm not suggesting", "i'm not advocating",
  "in conclusion", "to sum up",
  "at its core", "the real question is", "what really matters is",
  "it is worth noting", "it's worth noting",
  "know when to hold back", "understand when to hold back",
  "may be time to reconsider", "may be time for a rethink",
  "we've been trained to", "we've been conditioned",
  "operates on a different frequency",
  "what follows is", "what follows isn't",
  "you'd be forgiven for thinking",
  "the truth is,",
  "needless to say", "in today's world",
  "delve into",
  // Newly added — observed in failing 87% GPTZero sample
  "doing it catastrophically wrong", "catastrophically wrong",
  "it's the difference between",
  "is only as good as",
  "in a way that feels",
  "if you know where to look",
  "see if it changes",
  "deserves a second look",
  "instead of a vague",
  // From user's humanizer protocol — auto-fail banned phrases
  "it is important to remember", "important to remember",
  "tapestry of",
  "testament to",
  // Observed in 93% GPTZero output
  "so next time you're", "next time you're", "so the next time",
  "won't take much longer",
  "makes all the difference", "make all the difference",
  "fine isn't the same as right",
  "missing the point",
  "that's not what",
  "tremendous disservice",
  "it'll make all the difference",
  "and there's more",
];

// "Not only X but also Y" structural pattern — auto-fail per protocol.
const NOT_ONLY_BUT_ALSO_RE = /\bnot only\b[^.!?]{3,80}\bbut also\b/gi;

// AI-favoured words → human alternatives. Case-insensitive, word-boundary safe.
const WORD_SWAPS: [RegExp, string][] = [
  [/\bvibrant\b/gi, "alive"],
  [/\bshowcasing\b/gi, "showing"],
  [/\bshowcase\b/gi, "show"],
  [/\bpivotal\b/gi, "key"],
  [/\btapestry\b/gi, "mix"],
  [/\btestament\b/gi, "proof"],
  [/\bunderscores\b/gi, "shows"],
  [/\bunderscore\b/gi, "show"],
  [/\bintricate\b/gi, "specific"],
  [/\bfostering\b/gi, "building"],
  [/\benhancing\b/gi, "improving"],
  [/\bboasts\b/gi, "has"],
  [/\bnestled\b/gi, ""],
  [/\bgroundbreaking\b/gi, ""],
  [/\bbreathtaking\b/gi, ""],
  [/\brenowned\b/gi, "well-known"],
  [/\bbustling\b/gi, "busy"],
  [/\bpassionate\b/gi, "serious"],
  [/\bdedicated\b/gi, "focused"],
  [/\bundeniably\b/gi, ""],
  [/\bmoreover\b/gi, "and"],
  [/\bfurthermore\b/gi, "and"],
  [/\badditionally\b/gi, "and"],
];

// Strip ALL em/en dashes. GPTZero flags them in 2024-2025 even when used "varied".
// User's humanizer protocol said keep them, but live GPTZero testing showed
// 93% AI on output with em dashes. Reverting to aggressive strip.
export function stripDashes(text: string): string {
  let out = text;
  out = out.replace(/\s*–\s*/g, ", ");
  // Em dash followed by capital → period + space + capital
  out = out.replace(/\s*—\s*([A-Z])/g, ". $1");
  // Em dash mid-clause → comma
  out = out.replace(/\s*—\s*/g, ", ");
  // Clean artefacts
  out = out.replace(/,\s*,/g, ",");
  out = out.replace(/\.\s*,/g, ".");
  return out;
}

// Strip standalone bold/italic item names and markdown headings inside body.
// Converts "**Chilli Oil**\n\nChilli oil is..." → "Chilli oil is..."
export function stripBoldHeadings(text: string): string {
  let out = text;
  // Standalone bold lines: **X** on its own line, followed by blank, followed by paragraph
  out = out.replace(/^\s*\*\*([^*\n]+)\*\*\s*\n\s*\n/gm, "");
  // Standalone markdown headings inside body
  out = out.replace(/^\s*#{2,6}\s+[^\n]+\n\s*\n/gm, "");
  // Inline bold/italic remnants → strip markers, keep word
  out = out.replace(/\*\*([^*\n]+)\*\*/g, "$1");
  out = out.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1");
  return out;
}

// Drop entire sentence containing any banned phrase or banned structural pattern.
// Operates per-paragraph to preserve paragraph breaks.
export function stripBannedSentences(text: string): string {
  const paragraphs = text.split(/\n\s*\n/);
  const processed = paragraphs.map(para => {
    const sentences = para.split(/(?<=[.!?])\s+/);
    const kept = sentences.filter(s => {
      const lower = s.toLowerCase();
      if (BANNED_SENTENCE_PHRASES.some(p => lower.includes(p))) return false;
      if (NOT_ONLY_BUT_ALSO_RE.test(s)) { NOT_ONLY_BUT_ALSO_RE.lastIndex = 0; return false; }
      return true;
    });
    return kept.join(" ").trim();
  }).filter(Boolean);
  return processed.join("\n\n");
}

// Word-level swaps for AI-favoured vocabulary.
export function swapAIWords(text: string): string {
  let out = text;
  for (const [pat, repl] of WORD_SWAPS) {
    out = out.replace(pat, repl);
  }
  // Clean up double spaces from removed words
  out = out.replace(/[ \t]{2,}/g, " ");
  return out;
}

// Strip trailing "CTA closer" paragraphs that summarise the article's message.
// Also strips the last 1-2 paragraphs if they form a CTA-list pattern
// (multiple short imperatives or summary line).
const CTA_CLOSER_OPENERS = [
  /^the next time\b/i,
  /^so the next time\b/i,
  /^so next time\b/i,
  /^next time you\b/i,
  /^when you\b/i,
];
const CTA_CLOSER_LINES = [
  /^won't take much longer/i,
  /^takes \w+ seconds?/i,
  /^makes? all the difference/i,
  /^it'?ll make all the difference/i,
  /^but it'?ll/i,
  /^just a small/i,
];
export function stripCTACloser(text: string): string {
  const paras = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  if (paras.length < 2) return text;

  // Strip up to 2 trailing CTA paragraphs
  let cut = 0;
  for (let i = 0; i < 2; i++) {
    const last = paras[paras.length - 1 - cut];
    if (!last) break;
    const matchesOpener = CTA_CLOSER_OPENERS.some(r => r.test(last));
    const matchesLine = CTA_CLOSER_LINES.some(r => r.test(last));
    // Also strip if paragraph is 3+ short imperative sentences
    const sentences = last.split(/(?<=[.!?])\s+/);
    const shortImperatives = sentences.filter(s => {
      const len = s.split(/\s+/).filter(Boolean).length;
      return len <= 10 && /^(toast|bruise|blend|hold|slice|soak|stir|add|cut|cook|use|put|pour|grab|reach|try|take|pull|skip|swap|drop|chuck|leave|keep|store|push|finish|start|stop|find|look|do)\b/i.test(s.trim());
    }).length;
    const isCTAList = shortImperatives >= 3;

    if (matchesOpener || matchesLine || isCTAList) {
      cut++;
    } else break;
  }
  if (cut === 0) return text;
  return paras.slice(0, paras.length - cut).join("\n\n");
}

// Strip excess rhetorical-question fragments. "The problem?" / "The right way?" / "But if you're X?"
// Solo question sentences followed by an answer = AI pattern. Convert to declarative.
export function stripRhetoricalQuestions(text: string): string {
  // Match short question sentences (under 8 words, ending in ?)
  // Often followed by an emphatic answer paragraph.
  return text.replace(/([.!?]\s+)([A-Z][^.!?]{0,40}\?)(\s+)/g, (full, before, q, after) => {
    const words = q.split(/\s+/).filter(Boolean).length;
    if (words < 8) return before + after; // drop the rhetorical question
    return full;
  });
}

// Strip excess single-sentence emphatic paragraphs. AI uses them as "emphasis tricks".
// Heuristic: paragraphs of 1 short sentence (under 8 words) — keep at most 2 per article.
export function limitEmphaticParagraphs(text: string): string {
  const paras = text.split(/\n\s*\n/);
  let kept = 0;
  const out = paras.map(p => {
    const trimmed = p.trim();
    if (!trimmed) return p;
    const sentences = trimmed.split(/(?<=[.!?])\s+/);
    if (sentences.length === 1) {
      const wc = sentences[0].split(/\s+/).filter(Boolean).length;
      if (wc < 8) {
        if (kept < 2) { kept++; return p; }
        return ''; // drop excess emphatic single-line paragraphs
      }
    }
    return p;
  });
  return out.filter(p => p.trim() !== '').join('\n\n').replace(/\n{3,}/g, '\n\n');
}

// Full pipeline.
export function postProcess(text: string): string {
  let out = text;
  out = stripBoldHeadings(out);
  out = stripDashes(out);
  out = stripRhetoricalQuestions(out);
  out = stripBannedSentences(out);
  out = swapAIWords(out);
  out = stripCTACloser(out);
  out = limitEmphaticParagraphs(out);
  // Normalise paragraph spacing
  out = out.replace(/\n{3,}/g, "\n\n").trim();
  return out;
}
