import OpenAI from 'openai';
import { loadStyleProfile } from './style-extractor';
import { loadArticles, type Article } from './scraper';
import { buildFeedbackPrompt } from './feedback';
import { loadTaxonomy } from './taxonomy';

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
- Paragraph 1 (Hook): Challenge an assumption or name a problem the reader recognises. Use a collective "we/us" confessional voice — "For a lot of us...", "We've spent years...", "Those of us who..." — NOT an adversarial "You can X. Or you can Y." opener. Warm and self-deprecating, not combative. 3-4 sentences.
- Paragraph 2 (Context): The principle behind the recommendation. 2-3 sentences. No fluff.
- Paragraphs 3-5 (EXACTLY 3 items — IGNORE any number in the topic title. If topic says "5 things" or "10 ways", still write EXACTLY 3. Pick the 3 most interesting.): Each item gets ONE paragraph. The item name must be the first word of the paragraph, embedded into a plain prose sentence — "Chilli oil is one of those things..." — NO bold, NO italic, NO formatting, NO standalone name before the paragraph. It is simply how the sentence starts. CRITICAL structural rule: each item paragraph focuses on ONE specific angle only — texture, or smell, or what it makes possible, or a moment of using it. DO NOT run through the full arc [what it is → store-bought failure → homemade better → usage → storage] in every paragraph. VARY the approach per item. Do NOT close every item with a storage duration sentence. NEVER list ingredients with quantities. 5-7 sentences each.
- Paragraph 6 (Honest caveat): One candid, dry note on what you're NOT claiming. Short. Not preachy.
- Paragraph 7 (Close): ONE specific image, moment, or observation. Not a summary. Not a thematic declaration. Quiet and particular — the way Colin ends on "he adjusts the flame and goes back to work." End mid-thought, not at the conclusion.
- TARGET WORD COUNT: 600-800 words total.
- SENTENCE RHYTHM: Vary length dramatically. Write some sentences under 8 words. Some over 35 words. Never three sentences of similar length in a row. Colin's rhythm: long descriptive → short punchy → long → very short.
- CRITICAL: Zero markdown headings. Zero recipe-format lists. Zero "Let's get into it." Zero store-bought vs homemade comparison in every paragraph.`,

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
- NEVER write markdown H2 or H3 headings (## or ###) inside the article body — not for any genre, not even lifestyle-guide.
- NEVER use **bold** or *italic* formatting on item names. WRONG: a blank line, then "**Chilli Oil**", then a blank line, then a paragraph. RIGHT: start the paragraph directly with "Chilli oil is one of those things..." — plain text, no formatting, item name embedded in the opening sentence. If you output a standalone bold or heading line before any paragraph, the article is rejected.
- Never use listicle format, bullet points, or numbered lists INSIDE the article body.
- Your wit is dry, never slapstick — one dry observation per article, placed naturally, often as a parenthetical aside (like this)
- Address the reader as "you" at least twice — inviting them in, not telling them what to feel
- Anchor the article in a specific Malaysian/KL location, reference, or cultural touchstone unless explicitly told to use a global lens
- Write as if this is going straight to your editor — no AI filler, no throat-clearing
- NEVER use these phrases — they will be rejected: "In conclusion", "It is worth noting", "In today's world", "Needless to say", "refuses to be pinned down", "royal and rustic", "liquid history", "delve into", "tapestry", "rich tapestry", "stands as a testament", "it's worth noting", "at the end of the day", "journey through", "a culinary journey", "takes us on a journey", "passionate", "dedicated", "vibrant", "bustling", "undeniably", "The truth is,", "carefully considered", "That's where things get interesting", "suggest there might be", "understand when to hold back", "know when to hold back", "there might be a way back in", "it may be time for a rethink", "may be time to reconsider", "The reality is", "understand this instinctively", "none of this is to suggest", "none of this is to say", "we've been conditioned", "conditioned to", "we've been trained to", "it's worth remembering", "at its core", "let's get into it", "here's the thing", "here's what", "that has to count for something", "to be fair", "Picture this:", "picture this", "Imagine this:", "That's what happens when", "What follows is", "What follows isn't", "operates on a different frequency"
- NEVER write a self-disclaimer or caveat paragraph — Colin does not pre-defend his recommendations, announce what the article is or isn't ("What follows isn't a list of...", "This isn't about..."), or explain his intentions ("I'm not claiming...", "I'm not suggesting..."). Cut it. Go straight into the content.
- NEVER use AI mid-article summary lines ("The best desserts understand this instinctively", "That's where things get interesting", "Here's what we found")
- NEVER repeat a distinctive Colin phrase within the same article — if "tremendous disservice" appears in para 1, it cannot appear again in the same piece
- NEVER use over-constructed logical framing ("proves X belongs at Y just as naturally as Z") — Colin's register is warmer and more casual, not syllogistic
- Close quietly and personally — NOT with a grand declaration or a 3-part logical argument that builds to a thematic conclusion
- Never invent facts, specific dishes, or biographical details that were not given to you in the topic brief
- SENTENCE RHYTHM: Vary sentence length dramatically throughout. Short sentences (under 8 words) must appear. Very long sentences (over 35 words) must appear. Never write three sentences of similar length back-to-back. This is the single biggest difference between Colin's prose and AI prose.
- If the topic contains a number ("5 ways", "10 things", "3 rules"), IGNORE that number for structure — follow the skeleton's item count exactly.`;
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
        content: `Write a complete article about: ${topic.replace(/\b\d+\b/g, '').replace(/\s+/g, ' ').trim()}\n\nCRITICAL FORMATTING CHECK: Your output must contain ZERO lines that look like this: **Word** or ## Word or ### Word or *Word* on their own line before a paragraph. If you are about to write "**Chilli Oil**" or "## Mayonnaise" as a standalone line, STOP. Instead write: "Chilli oil is one of those things..." as a plain prose sentence. This is the single most important rule.\n\nFollow the structural skeleton exactly. Write the full article from start to finish. Do not stop early.${sourceReminder}`,
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
