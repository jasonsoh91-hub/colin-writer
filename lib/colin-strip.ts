// Deterministic Colin-side post-processor.
//
// Runs AFTER the LLM finishes generating. Strips/replaces phrases that
// Sonnet occasionally slips past the system-prompt ban list. Pure
// string ops — no model calls, no rate limits, always enforced.
//
// Two kinds of fixes:
//   1. Sentence-level drop — phrase signals an AI-tell so distinctive that
//      the entire sentence containing it gets removed.
//   2. Word/phrase-level swap — surgical replacement, preserves the
//      surrounding sentence.
//
// Apply via stripColinSlips(rawText) at the end of generation.

// Phrases whose containing sentence gets removed entirely. Use only when the
// rest of the sentence won't make sense without the banned phrase (e.g.
// philosophical filler sentences).
const DROP_SENTENCE_IF_CONTAINS = [
  "operates on a similar principle",
  "operates on a different frequency",
  "understood this instinctively",
  "understand this instinctively",
  "let's get into it",
  "let's take a look",
  "let's dive in",
  "in conclusion",
  "in today's world",
  "carefully considered",
  "suggest there might be",
  "that's where things get interesting",
  // Double-negatives — too risky to prefix-strip (flips meaning)
  "none of this is to say",
  "none of this is to suggest",
  // Self-disclaimer pattern — Colin doesn't pre-defend
  "i'm not suggesting",
  "i'm not claiming",
  "i'm not advocating",
];

// Prefix-strip patterns: regex matches a leading AI-tell phrase at the start
// of a sentence; the remainder is kept and re-capitalised. Preserves
// continuity so no follow-on sentence is left dangling.
//
// Order matters — longer / more-specific patterns first.
const PREFIX_STRIP_PATTERNS: { re: RegExp; lead?: string }[] = [
  // "And here's the thing: X" / "Here's the thing about Y: X" / "Here's the thing, X"
  { re: /^(?:and\s+)?here'?s the thing(?:\s+about\s+[^:.,]+)?[:,]?\s*/i },
  // "The truth is, X" / "The truth is that X"
  { re: /^the truth is[,]?\s*(?:that\s+)?/i },
  // "At its core, X"
  { re: /^at its core[,]?\s*/i },
  // "It's worth noting that X" / "It is worth noting X"
  { re: /^(?:it'?s|it is) worth noting(?:\s+that)?\s+/i },
  // "It's important to note that X"
  { re: /^(?:it'?s|it is) important to note(?:\s+that)?\s+/i },
  // "We've been conditioned to think that X" / "We've been trained to X"
  { re: /^we'?ve been (?:conditioned|trained|told)(?:\s+to(?:\s+\w+)?)?(?:\s+that)?\s+/i },
];

function capitalizeFirst(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function applyPrefixStrips(sentence: string): { text: string; stripped: boolean } {
  let s = sentence.replace(/^\s+/, '');
  // Track the leading whitespace separately so we restore the original spacing
  const leadWs = sentence.length - s.length > 0 ? sentence.slice(0, sentence.length - s.length) : '';
  let stripped = false;
  for (const p of PREFIX_STRIP_PATTERNS) {
    if (p.re.test(s)) {
      const replaced = s.replace(p.re, p.lead ?? '');
      s = p.lead ? replaced : capitalizeFirst(replaced);
      stripped = true;
      break;
    }
  }
  return { text: leadWs + s, stripped };
}

// Surgical word/phrase swaps. Case-preserving on first char only.
const SWAPS: [RegExp, string][] = [
  [/\btremendous disservice\b/gi, "rough deal"],
  [/\bdelve into\b/gi, "look at"],
  [/\bdelve\b/gi, "look"],
  [/\btapestry\b/gi, "mix"],
  [/\btestament to\b/gi, "proof of"],
  [/\bvibrant\b/gi, "alive"],
  [/\bbustling\b/gi, "busy"],
  [/\bpassionate\b/gi, "serious"],
  // NOTE: "dedicated" → "focused" swap was making Sonnet produce "focused to"
  // instead of "dedicated to" (grammatically wrong). Removed.
  [/\bundeniably\b/gi, ""],
  [/\bmoreover\b/gi, "and"],
  [/\bfurthermore\b/gi, "and"],
  [/\badditionally\b/gi, "and"],
  [/\bgroundbreaking\b/gi, ""],
  [/\bbreathtaking\b/gi, ""],
  [/\brenowned\b/gi, "well-known"],
  [/\bunderscore[sd]?\b/gi, "show"],
  // "focused to" is a Sonnet-invented phrase; correct English is "dedicated to" / "of"
  [/\bfocused to\b/gi, "dedicated to"],
];

// Split a paragraph into sentences while preserving terminator + spacing.
// Returns list of { text, terminator } so we can rebuild faithfully.
interface Sentence {
  text: string;
  terminator: string; // '.', '!', '?', ', ' etc.
}

function splitSentences(paragraph: string): Sentence[] {
  // Match: anything up to a sentence terminator (. ! ?) optionally followed
  // by a closing quote/paren, then whitespace. Capture terminator separately.
  const out: Sentence[] = [];
  const re = /([^.!?]*?)([.!?]+["”')\]]?)(\s+|$)/g;
  let lastEnd = 0;
  let m;
  while ((m = re.exec(paragraph)) !== null) {
    out.push({ text: m[1], terminator: m[2] + m[3] });
    lastEnd = re.lastIndex;
  }
  // Trailing fragment without terminator
  if (lastEnd < paragraph.length) {
    out.push({ text: paragraph.slice(lastEnd), terminator: '' });
  }
  return out;
}

function shouldDropSentence(sentence: string): boolean {
  const lower = sentence.toLowerCase();
  return DROP_SENTENCE_IF_CONTAINS.some(p => lower.includes(p));
}

function applySwaps(text: string): string {
  let out = text;
  for (const [re, replacement] of SWAPS) {
    out = out.replace(re, replacement);
  }
  // Collapse double spaces / leading spaces left by empty swaps.
  out = out.replace(/[ \t]{2,}/g, ' ').replace(/^[ \t]+/gm, '');
  return out;
}

function processParagraph(paragraph: string, report?: StripReport): string {
  if (!paragraph.trim()) return paragraph;
  const sentences = splitSentences(paragraph);
  const out: string[] = [];
  for (const s of sentences) {
    if (shouldDropSentence(s.text)) {
      if (report) report.removedSentences.push(s.text.trim());
      continue;
    }
    const { text: stripped, stripped: didStrip } = applyPrefixStrips(s.text);
    if (didStrip && report) report.prefixStrippedSentences.push(s.text.trim());
    out.push(applySwaps(stripped) + s.terminator);
  }
  return out.join('').trim();
}

export interface StripReport {
  removedSentences: string[];
  prefixStrippedSentences: string[];
  swapsApplied: number;
}

// Remove any leading markdown title/bold line before the first prose paragraph.
// Colin never publishes with "**Title**" or "# Title" at the top of the body.
// Matches: "# X", "## X", "### X", "**X**", "*X*", or the same wrapped in blank
// lines. Only touches the very top of the article — inline markdown is left alone.
function stripLeadingTitleLines(text: string): string {
  const lines = text.split('\n');
  let i = 0;
  while (i < lines.length) {
    const l = lines[i].trim();
    if (l === '') { i++; continue; }
    const isMarkdownHeading = /^#{1,6}\s/.test(l);
    const isFullBoldLine = /^\*\*[^*]+\*\*[.!?]?$/.test(l);
    const isFullItalicLine = /^\*[^*]+\*[.!?]?$/.test(l);
    if (isMarkdownHeading || isFullBoldLine || isFullItalicLine) {
      i++;
      continue;
    }
    break;
  }
  return lines.slice(i).join('\n').replace(/^\n+/, '');
}

export function stripColinSlips(text: string, report?: StripReport): string {
  const detitled = stripLeadingTitleLines(text);
  const paragraphs = detitled.split(/(\n+)/); // keep separators
  const out: string[] = [];
  for (const seg of paragraphs) {
    if (/^\n+$/.test(seg)) {
      out.push(seg);
    } else {
      out.push(processParagraph(seg, report));
    }
  }
  // Final pass: collapse 3+ blank lines (created by all-dropped paragraphs)
  return out.join('').replace(/\n{3,}/g, '\n\n').trim();
}
