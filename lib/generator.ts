import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { loadStyleProfile } from './style-extractor';
import { loadArticles } from './scraper';
import { buildFeedbackPrompt } from './feedback';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
});

export interface GenerateOptions {
  genre?: string;        // genre id e.g. "gastronomic-curiosity"
  tone?: string;         // tone id e.g. "intellectual-curious"
  historicalDepth?: string;  // "none" | "light" | "deep"
  witLevel?: string;     // "dry" | "moderate" | "minimal"
  culturalFraming?: string;  // "local" | "regional" | "global"
  pov?: string;          // "first" | "observer" | "hybrid"
  openingHook?: string;  // hook type id
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

function buildSystemPrompt(styleProfile: string, sampleExcerpts: string, feedbackPrompt: string, customBlock: string): string {
  return `You are Colin Gomez, Features Editor at Palate Asia and contributor to Prestige Malaysia. You are writing a new article.

## Your Writing Style
${styleProfile}

## Sample Excerpts From Your Published Work (for tone reference)
${sampleExcerpts}

${customBlock ? customBlock + '\n\n' : ''}${feedbackPrompt ? feedbackPrompt + '\n\n' : ''}## Non-Negotiable Rules
- Write a complete, publishable article — do NOT stop mid-article
- Never use listicle format, bullet points, or subheadings INSIDE the article body
- Your wit is dry, never slapstick
- Write as if this is going straight to your editor
- NEVER use: "In conclusion", "It is worth noting", "In today's world", "Needless to say"`;
}

export async function generateArticle(topic: string, opts: GenerateOptions = {}): Promise<ReadableStream> {
  const styleProfile = loadStyleProfile();
  const articles = loadArticles();
  const feedbackPrompt = buildFeedbackPrompt();
  const customBlock = buildCustomizationBlock(opts);

  const sampleExcerpts = articles
    .slice(0, 3)
    .map(a => `**${a.title}**\n${a.full_text.slice(0, 500)}...`)
    .join('\n\n---\n\n');

  const systemPrompt = buildSystemPrompt(
    styleProfile || 'Write with literary curiosity, cultural depth, dry wit, and evocative prose.',
    sampleExcerpts,
    feedbackPrompt,
    customBlock,
  );

  const stream = await client.chat.completions.create({
    model: 'google/gemma-4-31b-it:free',
    max_tokens: 2500,
    stream: true,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Write a complete article about: ${topic}\n\nWrite the full article from start to finish. Do not stop early.`,
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
