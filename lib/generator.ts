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
  sourceNotes?: string; // Interview quotes, key facts, venue details — grounds the article in real specifics
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
- CRITICAL: Do NOT open with a physical scene (chef doing something, food being plated, hands at work). Colin never does this. That is a magazine feature convention — not his style.
- Paragraph 1 (Definitive Context): Establish who this person is and why they matter NOW. Use a definitive claim — "X has become...", "X is the kind of chef who...", "X opened Y at a moment when...". 2-3 sentences.
- Paragraph 2 (Origin): How did they get here? Where they trained or came from. What defines their approach. Brief, factual, not biographical résumé. 3-4 sentences.
- Paragraph 3 (The Circumstance): What brought them to this specific point — a decision, a pivot, a collaboration, a moment. 3-4 sentences.
- Paragraphs 4-6 (Their Voice): What they believe about food or craft. Use their actual words if a topic brief is given, or paraphrase a specific concrete belief. Let personality emerge through specifics and contradictions, not through adjectives like "passionate" or "dedicated".
- Paragraph 7 (Philosophy Distilled): The one thing that defines their approach. Concrete and specific — not a generalisation. 3-4 sentences.
- Paragraph 8 (Close — quiet and forward): Where they are headed. End with one specific detail or image that stays with the reader. NOT a grand declaration. NOT "and that is why X is one of KL's most exciting chefs." End quiet and particular.
- SECOND PERSON: Occasionally address the reader as "you" — inviting them into the experience.
- TARGET WORD COUNT: 600-900 words.`,

  'lifestyle-guide': `
## Article Structure — follow this skeleton exactly
- Paragraph 1 (Hook): Challenge an assumption or name a problem the reader recognises. Direct and punchy — "You can X. Or you can Y." NOT a passive opener. NOT a listicle opener. 3-4 sentences.
- Paragraph 2 (Context): The principle behind the recommendation. 2-3 sentences. No fluff.
- Paragraphs 3-5 (Exactly 3 items — no more, no less): Each item gets ONE paragraph. Open with the item name as a natural sentence anchor — write it as plain prose, NOT a subheading, NOT bold, NOT italic. Example: "A bench scraper is the tool nobody talks about until..." NOT "**Bench Scraper**" or "## Bench Scraper". Describe how it looks or seems at first glance, then why it surprises you. Include one specific scenario or "Picture this:" moment per item. 5-7 sentences each. Make these paragraphs rich and detailed — at least 80 words per item paragraph.
- Paragraph 6 (Acknowledge the obvious objection): Note what you're NOT recommending and why. One dry observation. 3-4 sentences.
- Paragraph 7 (Close): Personal, quiet. One thought that sends the reader off. First person if natural. 3-4 sentences.
- TARGET WORD COUNT: 600-800 words total. Do not stop short. If you finish the skeleton and are under 500 words, expand your item paragraphs.
- CRITICAL: Do NOT write about chef's knives, cast iron skillets, or wooden cutting boards — these are generic defaults every food writer uses. Choose unexpected, specific tools that solve real problems in surprising ways.`,

  'venue-spotlight': `
## Article Structure — follow this skeleton exactly
- Paragraph 1 (Arrival): Scene-set. Put the reader at the entrance. Atmosphere before facts.
- Paragraph 2 (Context): Why does this venue exist? Brief history or concept.
- Paragraphs 3-6 (The experience): Walk through what you eat, drink, or do. Name specific dishes. Describe textures and flavours precisely.
- Paragraph 7 (The feel): Atmosphere, crowd, vibe. What kind of evening is this?
- Paragraph 8 (Close): One honest, specific reason why you would — or would not — return.`,

  'debunking-explainer': `
## Article Structure — follow this skeleton exactly
- Paragraph 1 (The Claim): Open with a blunt, provocative statement that declares the conventional wisdom is wrong. 2-3 sentences. Use "There, I said it." or equivalent. Do NOT hedge. Do NOT qualify. Colin's model: "Vegetables aren't real. There, I said it."
- Paragraph 2 (The Imaginary Sceptic): Address the reader directly as a sceptic. Give them words to push back with. Then demolish the pushback immediately. Use second person throughout — "you", "you're", "you point to". Include one parenthetical joke. 4-5 sentences.
- Paragraphs 3-6 (The Evidence — one item per paragraph): Cover 4 specific examples that prove the claim. For each: (1) name the item (carrot, broccoli, tomato, etc.), (2) state the surprising fact about what it actually is botanically/scientifically, (3) add one specific detail (a date, a name, a scientific term) that makes it feel researched, (4) end with a dry aside or snarky observation. 4-5 sentences each.
- Paragraph 7 (The Pivot): After proving the claim, pivot to the philosophical point. Why does this matter? What does it say about the way we construct reality? Connect the food topic to something larger — language, money, countries, social contracts. 4-5 sentences.
- Paragraph 8 (The Graceful Concession): Acknowledge that the lie is actually fine. We all agree to pretend. Close on a note of wry pragmatism rather than outrage. End quiet and dry — not grand. 3-4 sentences.
- CRITICAL VOICE RULES: Write in second person throughout. Use parenthetical asides for jokes — (like this). Address the imaginary sceptic directly. Never be angry — be amused. The tone is "I can't believe I have to explain this" not "this is scandalous".`,
};

// Genre keywords to match a full article example from the corpus
const GENRE_ARTICLE_KEYWORDS: Record<string, string[]> = {
  'gastronomic-curiosity': ['porcupine', 'kafana', 'bak-kut-teh', 'lihing', 'laksa', 'ghee', 'kaya', 'capsaicin', 'glass', 'toddy', 'bunga', 'roselle', 'khachapuri', 'ochazuke', 'francesinha'],
  'chef-profile': ['chef', 'terumi', 'adek', 'conversation', 'unfiltered', 'barista', 'bartender'],
  'lifestyle-guide': ['air-fryer', 'charcuterie', 'affordable', 'superfood', 'kitchen-tools', 'grilled-cheese', 'cooking-with-wine', 'ferment', 'sauce', 'pantry', 'brunch', 'waste'],
  'venue-spotlight': ['inside', 'bar', 'dotty', 'sushi', 'tanburi', 'auntie', 'stanley', 'kayra', 'campus'],
  'debunking-explainer': ['lied', 'truth', 'vegetables', 'myth', 'construct', 'real', 'fake', 'actually', 'wrong', 'debunk'],
};

function getGenreMatchedArticle(articles: Article[], genre?: string, topic?: string): Article | null {
  // First: try to match on topic words against article slugs (most specific)
  if (topic) {
    const topicWords = topic.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3);
    const topicMatch = articles.find(a => topicWords.some(w => a.slug.includes(w) || a.title.toLowerCase().includes(w)));
    if (topicMatch) return topicMatch;
  }

  // Second: match on genre keywords
  if (genre && GENRE_ARTICLE_KEYWORDS[genre]) {
    const keywords = GENRE_ARTICLE_KEYWORDS[genre];
    const genreMatch = articles.find(a => keywords.some(kw => a.slug.includes(kw)));
    if (genreMatch) return genreMatch;
  }

  return articles[0] ?? null;
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

const COLIN_REAL_OPENINGS = `
## How Colin Actually Opens Articles — Study These Exact First Lines

1. "At first glance, ghee is just butter that's been cooked a little longer. In practice, though, it's the thing responsible for some of the richest, most comforting flavours in Indian cooking."
   — Pattern: surface observation → immediate reframe of significance

2. "Story of Ono has become a reference point in Kuala Lumpur's specialty café scene, known for its hybrid approach to coffee and matcha, and its tightly considered approach to experience."
   — Pattern: definitive claim of status + two specific reasons why

3. "There's a new pizza chain in town, and thankfully, it isn't another one of those artisanal wood-fired situations engineered by a man in suspenders or similarly questionable attire."
   — Pattern: news hook → immediate dry wit to subvert expectation

4. "Not every dangerous food is the result of poor judgement. Sometimes it's the result of generations of people looking at something poisonous, toxic, or otherwise inedible and deciding to figure it out anyway."
   — Pattern: challenge the obvious assumption → reframe as human ingenuity

5. "Cooking from the pantry isn't about making do. It's about knowing how to build something coherent from what's already there."
   — Pattern: two short declarative sentences that flip the conventional meaning

NOTICE: None of these open with a scene of someone doing something. None start with "The". None announce the article's existence ("In this article, we..."). All land the core idea in the first two sentences.
`.trim();

function buildSystemPrompt(styleProfile: string, fullArticleExample: string, feedbackPrompt: string, customBlock: string, sourceNotes?: string): string {
  const sourceBlock = sourceNotes?.trim()
    ? `## Source Material — Use These Specific Facts, Quotes, and Details\nDo NOT invent details not present here. Ground every claim in this material.\n\n${sourceNotes.trim()}`
    : '';

  return `You are Colin Gomez, Features Editor at Palate Asia and contributor to Prestige Malaysia. You are writing a new article.

## Your Writing Style
${styleProfile}

${COLIN_REAL_OPENINGS}

## A Complete Published Article Of Yours — Study The Full Structure, Voice, And Rhythm
${fullArticleExample}

${sourceBlock ? sourceBlock + '\n\n' : ''}${customBlock ? customBlock + '\n\n' : ''}${feedbackPrompt ? feedbackPrompt + '\n\n' : ''}## Non-Negotiable Rules
- Write a complete, publishable article — do NOT stop mid-article
- NEVER open with a physical scene of someone doing something (chef torching fish, hands folding rice, barista pouring coffee) — Colin does not do this
- Never use listicle format, bullet points, subheadings, or **bold text** INSIDE the article body — write all item names as plain prose sentence anchors
- Your wit is dry, never slapstick — one dry observation per article, placed naturally, often as a parenthetical aside (like this)
- Address the reader as "you" at least twice — inviting them in, not telling them what to feel
- Anchor the article in a specific Malaysian/KL location, reference, or cultural touchstone unless explicitly told to use a global lens
- Write as if this is going straight to your editor — no AI filler, no throat-clearing
- NEVER use these phrases — they will be rejected: "In conclusion", "It is worth noting", "In today's world", "Needless to say", "refuses to be pinned down", "royal and rustic", "liquid history", "delve into", "tapestry", "rich tapestry", "stands as a testament", "it's worth noting", "at the end of the day", "journey through", "a culinary journey", "takes us on a journey", "passionate", "dedicated", "vibrant", "bustling", "undeniably"
- Close quietly and personally — NOT with a grand declaration
- Never invent facts, specific dishes, or biographical details that were not given to you in the topic brief`;
}

export async function generateArticle(topic: string, opts: GenerateOptions = {}): Promise<ReadableStream> {
  const styleProfile = loadStyleProfile();
  const articles = loadArticles();
  const feedbackPrompt = await buildFeedbackPrompt();
  const customBlock = buildCustomizationBlock(opts);

  // Use one full genre-matched article — cap at 3000 words to stay within context
  const validArticles = articles.filter(a => {
    const wc = a.full_text.split(/\s+/).length;
    return wc > 200 && wc < 3000;
  });
  const exampleArticle = getGenreMatchedArticle(validArticles, opts.genre, topic);
  const fullArticleExample = exampleArticle
    ? `**${exampleArticle.title}**\n\n${exampleArticle.full_text}`
    : validArticles[0] ? `**${validArticles[0].title}**\n\n${validArticles[0].full_text}` : '';

  const systemPrompt = buildSystemPrompt(
    styleProfile || 'Write with literary curiosity, cultural depth, dry wit, and evocative prose.',
    fullArticleExample,
    feedbackPrompt,
    customBlock,
    opts.sourceNotes,
  );

  // Build user prompt — include source notes reminder if provided
  const sourceReminder = opts.sourceNotes?.trim()
    ? `\n\nIMPORTANT: Use the Source Material provided in the system prompt. Do not invent any facts or details not present there.`
    : '';

  const stream = await getClient().chat.completions.create({
    model: 'anthropic/claude-sonnet-4-5',
    max_tokens: 2500,
    temperature: 0.85,
    stream: true,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Write a complete article about: ${topic}\n\nFollow the structural skeleton exactly. Write the full article from start to finish. Do not stop early.${sourceReminder}`,
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
