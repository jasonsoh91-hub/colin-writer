import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { loadStyleProfile } from './style-extractor';
import { loadArticles, type Article } from './scraper';
import { buildFeedbackPrompt } from './feedback';

function getClient() {
  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
  });
}

export interface GenerateOptions {
  genre?: string;
  tone?: string;
  historicalDepth?: string;
  witLevel?: string;
  culturalFraming?: string;
  pov?: string;
  openingHook?: string;
}

// Hardcoded structural skeleton per genre — forces Colin's article shape
const GENRE_STRUCTURES: Record<string, string> = {
  'gastronomic-curiosity': `
## Article Structure — follow this skeleton exactly
- Paragraph 1 (Hook): Open with a rhetorical question, paradox, or contradiction about the subject. 2-3 sentences. Do NOT start with "The" or "In". Do NOT state a fact — pose an invitation.
- Paragraph 2 (Light context): Cultural or origin framing. How did this subject come to be? Keep it accessible — one or two cultural facts, not a history essay. 3-4 sentences.
- Paragraphs 3–8 (Exploration by region/type): One paragraph per region, variety, or angle. Each paragraph: (1) open by signalling the location or variety, (2) describe the key ingredient or broth, (3) name 2-3 specific toppings or characteristics, (4) give it a personality — what is distinctive about this version? 4-6 sentences each.
- Paragraph 9 (Acknowledge the gaps): Note what you haven't covered. Include one dry, self-aware line — something like "I'd need to slap a cover on this and call it a book."
- Paragraph 10 (Personal close): Pull back from facts to feeling. Urge the reader to experience it. Use first person if natural. End quiet and understated — not grand or declarative.`,

  'chef-profile': `
## Article Structure — follow this skeleton exactly
- Paragraph 1 (Scene): Place the subject in action. One specific sensory detail of the setting. 2-3 sentences.
- Paragraph 2 (Who they are): Background — where they trained, what defines their approach. 3-4 sentences.
- Paragraphs 3-6 (The conversation): Anecdote-driven. Quote or paraphrase the subject. Let their personality emerge through specifics, not adjectives.
- Paragraph 7 (Philosophy): What they believe about food or craft. 3-4 sentences.
- Paragraph 8 (Close): Where they're heading. Forward-looking, not promotional. End with one specific detail that stays with the reader.`,

  'lifestyle-guide': `
## Article Structure — follow this skeleton exactly
- Paragraph 1 (Hook): Challenge an assumption or name a problem the reader recognises. NOT a listicle opener.
- Paragraph 2 (Why it matters): Brief context. Why is this worth knowing? 2-3 sentences.
- Paragraphs 3-7 (The substance): Prose-based practical content. NO bullet points. NO subheadings inside the body. NO numbered lists. Flow naturally from one idea to the next.
- Paragraph 8 (Close): One dry or warm observation. Send the reader off with a thought, not a summary.`,

  'venue-spotlight': `
## Article Structure — follow this skeleton exactly
- Paragraph 1 (Arrival): Scene-set. Put the reader at the entrance. Atmosphere before facts.
- Paragraph 2 (Context): Why does this venue exist? Brief history or concept.
- Paragraphs 3-6 (The experience): Walk through what you eat, drink, or do. Name specific dishes. Describe textures and flavours precisely.
- Paragraph 7 (The feel): Atmosphere, crowd, vibe. What kind of evening is this?
- Paragraph 8 (Close): One honest, specific reason why you would — or would not — return.`,
};

// Genre keywords to match a full article example from the corpus
const GENRE_ARTICLE_KEYWORDS: Record<string, string[]> = {
  'gastronomic-curiosity': ['porcupine', 'kafana', 'bak-kut-teh', 'lihing', 'laksa', 'ghee', 'kaya', 'capsaicin', 'glass'],
  'chef-profile': ['chef', 'terumi', 'adek', 'conversation'],
  'lifestyle-guide': ['air-fryer', 'charcuterie', 'affordable', 'superfood'],
  'venue-spotlight': ['inside', 'bar', 'hotel'],
};

function getGenreMatchedArticle(articles: Article[], genre?: string): Article | null {
  if (!genre || !GENRE_ARTICLE_KEYWORDS[genre]) return articles[0] ?? null;
  const keywords = GENRE_ARTICLE_KEYWORDS[genre];
  return articles.find(a => keywords.some(kw => a.slug.includes(kw))) ?? articles[0] ?? null;
}

function loadTaxonomy() {
  const p = path.join(process.cwd(), 'data/colin-taxonomy.json');
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

function buildCustomizationBlock(opts: GenerateOptions): string {
  const taxonomy = loadTaxonomy();
  if (!taxonomy) return '';

  const lines: string[] = ['## Article Configuration (follow exactly)'];

  if (opts.genre) {
    const genre = taxonomy.genres?.find((g: { id: string }) => g.id === opts.genre);
    if (genre) {
      lines.push(`\n**Genre: ${genre.name}**`);
      lines.push(`Structure: ${genre.structure}`);
      lines.push(`Depth: ${genre.depth}`);
      lines.push(`Genre instruction: ${genre.prompt_instruction}`);
      const typePrompt = taxonomy.article_type_prompts?.[opts.genre];
      if (typePrompt) lines.push(`Additional: ${typePrompt}`);
    }
    // Inject hardcoded structural skeleton
    const skeleton = GENRE_STRUCTURES[opts.genre];
    if (skeleton) lines.push(skeleton);
  }

  if (opts.tone) {
    const tone = taxonomy.tones?.find((t: { id: string }) => t.id === opts.tone);
    if (tone) lines.push(`\n**Tone: ${tone.name}** — ${tone.description}`);
  }

  if (opts.historicalDepth) {
    const map: Record<string, string> = {
      none: 'No historical context — go straight to the subject.',
      light: 'Include a brief historical or origin note only.',
      deep: 'Spend the first third establishing full cultural/historical context — origins, class dynamics, colonial history if relevant.',
    };
    lines.push(`\n**Historical depth:** ${map[opts.historicalDepth] ?? opts.historicalDepth}`);
  }

  if (opts.witLevel) {
    const map: Record<string, string> = {
      dry: 'Wit is dry and deadpan — embedded in observations, never stated outright.',
      moderate: 'Wit surfaces occasionally — one sharp observation per few paragraphs.',
      minimal: 'Minimal wit — keep it serious and informative.',
    };
    lines.push(`**Wit level:** ${map[opts.witLevel] ?? opts.witLevel}`);
  }

  if (opts.culturalFraming) {
    const map: Record<string, string> = {
      local: 'Frame everything through a local Malaysian / KL lens.',
      regional: 'Use regional Asian context — SEA, East Asia, South Asia comparisons.',
      global: 'Use a global lens — compare across continents, civilizations, centuries.',
    };
    lines.push(`**Cultural framing:** ${map[opts.culturalFraming] ?? opts.culturalFraming}`);
  }

  if (opts.pov) {
    const map: Record<string, string> = {
      first: 'Write in first person — I am present, I tried this, I noticed.',
      observer: 'Write as a third-person observer — watching and reporting, not participating.',
      hybrid: 'Shift between first-person personal moments and omniscient observation.',
    };
    lines.push(`**POV:** ${map[opts.pov] ?? opts.pov}`);
  }

  if (opts.openingHook) {
    const hook = taxonomy.opening_hook_types?.find((h: { id: string }) => h.id === opts.openingHook);
    if (hook) lines.push(`\n**Opening hook type: ${hook.label}** — ${hook.description}`);
  }

  return lines.join('\n');
}

function buildSystemPrompt(styleProfile: string, fullArticleExample: string, feedbackPrompt: string, customBlock: string): string {
  return `You are Colin Gomez, Features Editor at Palate Asia and contributor to Prestige Malaysia. You are writing a new article.

## Your Writing Style
${styleProfile}

## A Complete Published Article Of Yours — Study The Full Structure, Voice, And Rhythm
${fullArticleExample}

${customBlock ? customBlock + '\n\n' : ''}${feedbackPrompt ? feedbackPrompt + '\n\n' : ''}## Non-Negotiable Rules
- Write a complete, publishable article — do NOT stop mid-article
- Never use listicle format, bullet points, or subheadings INSIDE the article body
- Your wit is dry, never slapstick — one dry observation per article, placed naturally
- Write as if this is going straight to your editor
- NEVER use: "In conclusion", "It is worth noting", "In today's world", "Needless to say", "refuses to be pinned down", "royal and rustic", "liquid history", "delve into"
- Close quietly and personally — NOT with a grand declaration`;
}

export async function generateArticle(topic: string, opts: GenerateOptions = {}): Promise<ReadableStream> {
  const styleProfile = loadStyleProfile();
  const articles = loadArticles();
  const feedbackPrompt = await buildFeedbackPrompt();
  const customBlock = buildCustomizationBlock(opts);

  // Use one full genre-matched article instead of 3 truncated excerpts
  const exampleArticle = getGenreMatchedArticle(articles, opts.genre);
  const fullArticleExample = exampleArticle
    ? `**${exampleArticle.title}**\n\n${exampleArticle.full_text}`
    : articles[0] ? `**${articles[0].title}**\n\n${articles[0].full_text}` : '';

  const systemPrompt = buildSystemPrompt(
    styleProfile || 'Write with literary curiosity, cultural depth, dry wit, and evocative prose.',
    fullArticleExample,
    feedbackPrompt,
    customBlock,
  );

  const stream = await getClient().chat.completions.create({
    model: 'google/gemma-4-31b-it:free',
    max_tokens: 2500,
    stream: true,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Write a complete article about: ${topic}\n\nFollow the structural skeleton exactly. Write the full article from start to finish. Do not stop early.`,
      },
    ],
  });

  return new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content ?? '';
        if (text) controller.enqueue(new TextEncoder().encode(text));
      }
      controller.close();
    },
  });
}
