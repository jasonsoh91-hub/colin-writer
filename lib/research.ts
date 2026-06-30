// Tavily-powered research module.
//
// Given a topic, searches Tavily for relevant articles, fetches the top
// results, extracts paragraph text, and returns a structured factsBlock
// suitable for injection into the generator's system prompt as source notes.
//
// Goal: replace AI-fabricated experts/stats/quotes with real ones from the
// open web, dropping detector AI-confidence on factual content.
//
// Tavily free tier: 1000 searches/month. Signup: https://tavily.com

import * as cheerio from 'cheerio';
import { execFile } from 'child_process';

const TAVILY_ENDPOINT = 'https://api.tavily.com/search';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export interface ResearchSource {
  url: string;
  title: string;
  excerpt: string;     // Tavily-provided summary
  bodyText?: string;   // Full extracted body if fetched successfully
}

export interface ResearchResult {
  query: string;
  sources: ResearchSource[];
  factsBlock: string;  // Formatted for injection into system prompt
}

interface TavilyHit {
  url: string;
  title: string;
  content: string;
  score?: number;
}

interface TavilyResponse {
  query: string;
  results: TavilyHit[];
}

function fetchPage(url: string, timeoutSec = 20): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('curl', [
      '-s', '-L', '-A', UA,
      '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      '-H', 'Accept-Language: en-US,en;q=0.9',
      '--compressed', '--max-time', String(timeoutSec),
      url,
    ], { maxBuffer: 15 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(err);
      if (!stdout) return reject(new Error('empty response'));
      resolve(stdout);
    });
  });
}

// Try several common article selectors. Fall back to all <p> tags.
function extractArticleBody(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, nav, footer, aside, .ad, form, noscript, iframe').remove();

  const selectors = [
    '[data-component-name="paragraph"]',  // CNN
    'article p',
    '.article-body p',
    '.entry-content p',
    '.post-content p',
    'main p',
    'p',
  ];

  for (const sel of selectors) {
    const ps: string[] = [];
    $(sel).each((_, el) => {
      const t = $(el).text().replace(/\s+/g, ' ').trim();
      if (t.length > 50) ps.push(t);
    });
    if (ps.length >= 3) return ps.slice(0, 30).join('\n\n');
  }

  return '';
}

// Domains to exclude from research results. CNN is the persona's own publication
// — if Claude sees a CNN article on the topic in its prompt, it paraphrases it,
// and detectors flag paraphrased-of-known-source as max AI confidence.
// Add other "voice template" domains here when activating new personas.
const EXCLUDED_DOMAINS = ['cnn.com', 'edition.cnn.com'];

function isExcluded(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return EXCLUDED_DOMAINS.some(d => host === d || host.endsWith('.' + d));
  } catch { return false; }
}

async function tavilySearch(query: string, max = 5): Promise<TavilyHit[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error('TAVILY_API_KEY not set in .env.local');

  const res = await fetch(TAVILY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      query,
      search_depth: 'advanced',
      max_results: max + EXCLUDED_DOMAINS.length, // over-fetch to compensate for filtering
      include_answer: false,
      include_raw_content: false,
      exclude_domains: EXCLUDED_DOMAINS,           // Tavily-side filter (belt + suspenders)
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tavily search failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as TavilyResponse;
  // Belt + suspenders: also filter client-side in case Tavily honors loosely.
  return (data.results ?? []).filter(r => !isExcluded(r.url));
}

// Extract candidate entities from raw text — names with titles, organizations,
// dates, numeric stats, quoted speech. Keeps the facts the AI needs without
// dumping enough body text for the AI to paraphrase the source's structure.
function extractEntities(text: string): { names: string[]; quotes: string[]; stats: string[]; orgs: string[] } {
  const names = new Set<string>();
  const quotes = new Set<string>();
  const stats = new Set<string>();
  const orgs = new Set<string>();

  // Person with title pattern: "Dr. Jane Smith", "John Doe, director of", "Prof. X said"
  const namePattern = /(?:Dr\.?|Prof\.?|Mr\.?|Ms\.?|Mrs\.?\s)?[A-Z][a-z]+(?:\s[A-Z][a-z]+){1,3}(?:,\s+(?:director|professor|spokesperson|manager|CEO|founder|owner|chief|head|analyst|researcher|expert|guide)[^.,;]{0,80})?/g;
  const nameMatches = text.match(namePattern) ?? [];
  for (const n of nameMatches) {
    const trimmed = n.trim();
    if (trimmed.length > 6 && trimmed.length < 120) names.add(trimmed);
  }

  // Quoted speech (3+ words inside curly or straight quotes)
  const quotePattern = /["“]([^"”]{20,250})["”]/g;
  let qMatch;
  while ((qMatch = quotePattern.exec(text)) !== null) {
    quotes.add(qMatch[1].trim());
  }

  // Stats: numbers with units, percentages, currencies, dates
  const statPattern = /(?:\$|¥|€|£)?[\d,]+(?:\.\d+)?(?:\s*(?:%|percent|million|billion|yen|dollars|degrees|km|kilometers|miles|years|passengers|tourists|visitors|seats|trains|hours))?/gi;
  const statMatches = text.match(statPattern) ?? [];
  for (const s of statMatches) {
    const trimmed = s.trim();
    if (/\d/.test(trimmed) && trimmed.length > 2 && trimmed.length < 50) stats.add(trimmed);
  }

  // Organizations: capitalized phrases with keywords
  const orgPattern = /[A-Z][A-Za-z&]+(?:\s+[A-Z][A-Za-z&]+){0,5}\s+(?:Company|Corporation|Hotel|University|Institute|Association|Center|Hospital|Ministry|Department|Office|Bureau|Agency|Group|Partners|Securities|Research|Daily|Times|News|Press)/g;
  const orgMatches = text.match(orgPattern) ?? [];
  for (const o of orgMatches) {
    const trimmed = o.trim();
    if (trimmed.length > 8 && trimmed.length < 100) orgs.add(trimmed);
  }

  return {
    names: Array.from(names).slice(0, 15),
    quotes: Array.from(quotes).slice(0, 8),
    stats: Array.from(stats).slice(0, 20),
    orgs: Array.from(orgs).slice(0, 10),
  };
}

function buildFactsBlock(sources: ResearchSource[]): string {
  if (sources.length === 0) return '';

  // Aggregate entities across all sources (de-duped via Set inside extractor).
  const allNames = new Set<string>();
  const allQuotes = new Set<string>();
  const allStats = new Set<string>();
  const allOrgs = new Set<string>();

  const sourceList: string[] = [];
  for (const s of sources) {
    const text = s.bodyText || s.excerpt;
    const ents = extractEntities(text);
    ents.names.forEach(n => allNames.add(n));
    ents.quotes.forEach(q => allQuotes.add(q));
    ents.stats.forEach(st => allStats.add(st));
    ents.orgs.forEach(o => allOrgs.add(o));
    sourceList.push(`- ${s.title} (${s.url})`);
  }

  const factSection = (label: string, items: Set<string>) => {
    if (items.size === 0) return '';
    return `\n**${label}:**\n${Array.from(items).map(x => `- ${x}`).join('\n')}`;
  };

  return `## Researched Facts From Real Sources
Use these REAL entities/quotes/stats from real published articles. Do NOT invent any expert, organization, statistic, or quote that is not in the lists below.

**CRITICAL — anti-paraphrase rule:** Do NOT mirror the sentence structure, paragraph order, opening style, or phrasing of the source articles. Use only the FACTS below; write the article in your own structure and rhythm.
${factSection('Real names + titles', allNames)}
${factSection('Real organizations', allOrgs)}
${factSection('Real statistics + numbers', allStats)}
${factSection('Real quotes (attribute to a name above if you use one)', allQuotes)}

**Source articles consulted (do NOT paraphrase these):**
${sourceList.join('\n')}`;
}

export async function research(topic: string, maxSources = 3): Promise<ResearchResult | null> {
  try {
    const hits = await tavilySearch(topic, 5);
    if (hits.length === 0) return null;

    const sources: ResearchSource[] = [];
    for (const hit of hits.slice(0, maxSources)) {
      const src: ResearchSource = {
        url: hit.url,
        title: hit.title,
        excerpt: hit.content,
      };

      try {
        const html = await fetchPage(hit.url, 15);
        const body = extractArticleBody(html);
        if (body && body.length > 300) src.bodyText = body;
      } catch (err) {
        // Fetch failed — keep Tavily excerpt as fallback
        console.warn(`[research] fetch failed for ${hit.url}: ${err instanceof Error ? err.message : err}`);
      }

      sources.push(src);
    }

    return {
      query: topic,
      sources,
      factsBlock: buildFactsBlock(sources),
    };
  } catch (err) {
    console.error('[research] error:', err instanceof Error ? err.message : err);
    return null;
  }
}
