// Log structured feedback for the next-5 iteration so buildFeedbackPrompt()
// surfaces these critiques into the NEXT Colin generation. Feedback flows via
// lib/feedback.ts → Supabase colin_feedback table.

import { existsSync, readFileSync } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

const envFile = '.env.local';
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

import { saveFeedback } from '../lib/feedback';

interface Entry {
  file: string;
  topic: string;
  rating: number;
  what_worked: string;
  what_to_improve: string;
  phrases_to_avoid: string;
  phrases_to_use_more: string;
}

const ENTRIES: Entry[] = [
  {
    file: 'vinegar.md',
    topic: 'All About Vinegar',
    rating: 9,
    what_worked: "Opens with the exact Colin short-paired pattern: 'You don't really need to think about vinegar this much. But once you start, it's hard to ignore how much it does with so little.' Uses concrete similes (subtlety of a fire alarm, controlled spoilage). Specific named vinegars (Zhenjiang, sherry solera). Close returns to the opening theme. Reads authentically Colin.",
    what_to_improve: "One awkward Sonnet-invented phrase: 'aisle focused to bottles' — grammatically wrong, should be 'aisle dedicated to' or 'aisle of'. This has now appeared twice across the last 5 gens. Root cause was a colin-strip SWAP entry replacing 'dedicated' → 'focused' in all contexts; removed now.",
    phrases_to_avoid: "'focused to X' (not English); using 'dedicated' followed by prepositional swap",
    phrases_to_use_more: "concrete absurdist similes for AI-tell-adjacent concepts (subtlety of a fire alarm, controlled spoilage)",
  },
  {
    file: 'instant-coffee.md',
    topic: 'The Truth About Instant Coffee',
    rating: 8,
    what_worked: "Malaysia-specific cultural anchor lands well: 'walk into any kopitiam in Malaysia and you'll find people drinking instant coffee mixed with condensed milk'. Real brand mentions (Wonda, Nescafé Gold, Penang roasters on vintage bicycles). Signature move 'shall we say, an admirably committed bit of branding' used correctly. Good Colin voice throughout body.",
    what_to_improve: "Article opens with '**The Truth About Instant Coffee**' — a markdown bold title. Colin never publishes with a title line at the top of the article body; the platform (palateasia.com) renders the title above the content. The generator prompt already forbids this, but Sonnet keeps doing it. Also used 'I'm not suggesting you ditch your pour-over setup' — Colin doesn't pre-defend his takes with 'I'm not X, but Y' disclaimer sentences. Both patterns now hard-stripped in colin-strip.ts.",
    phrases_to_avoid: "**Title** or ## Title or # Title as the first line of the article body; 'I'm not suggesting X, but Y' pre-defensive disclaimers",
    phrases_to_use_more: "kopitiam / mamak / KL-specific cultural anchors when the topic touches Malaysian daily life",
  },
  {
    file: 'sauces.md',
    topic: '3 Sauces You Should Always Have In The Fridge',
    rating: 8,
    what_worked: "Item subheadings correctly formatted — 'Oyster sauce', 'Gochujang', 'Kecap manis' each on their own plain-text line, no bold, no markdown. This matches Colin's real 'Kitchen Tools You Need' format. Regional Asian sauces well-chosen for a Malaysian audience. Named brands (Lee Kum Kee, ABC). Signature parenthetical wink 'hopefully not literally, given how much oil some restaurants use'. Close hits 'That has to count for something' pattern correctly.",
    what_to_improve: "Slight structural monotony: every item paragraph follows the same shape (what it is → what to use it for → texture note → brand). Vary the entry angle per item. For example, oyster sauce could open on a specific dish moment, gochujang on smell or texture, kecap manis on a childhood association. The style profile's lifestyle-guide section says 'VARY the approach per item' but the generator still tends toward parallel structure.",
    phrases_to_avoid: "'The main thing to watch for is X' (formulaic caveat at end of every item); repeating 'It's [adj], [adj], and [adj]' three-word rhythm across all items",
    phrases_to_use_more: "distinct paragraph-opening angles per item; specific scenes instead of general use cases",
  },
  {
    file: 'sourdough.md',
    topic: 'How Sourdough Actually Rises',
    rating: 7,
    what_worked: "Opens with the debunking pattern 'There's no magic in sourdough. There, I said it.' — a match for capsaicin and umami openers. Absurdist observations land: people naming their starter Gerald, debating whether it prefers jazz or classical music. Good specific technical detail: Saccharomyces exiguus, Lactobacillus sanfranciscensis, temperature ranges 24-28°C, hydration percentages.",
    what_to_improve: "Article opens with '# How Sourdough Actually Rises' — a markdown H1. Colin never publishes with a heading at the top. Now hard-stripped. More importantly, the close is too formulaic: 'Money is just paper until we all agree it's worth something. Countries are just lines on a map until we decide they matter. A sourdough starter is just yeast and bacteria until you name it Gerald and start talking about its moods.' This closes-with-philosophical-parallel structure has now appeared in both umami AND sourdough — it's becoming a template rather than a fresh close. Debunking-explainer needs varied endings — sometimes a scene, sometimes a wry aside, sometimes a genuine forward look. Article also runs 1091 words (top of range) — could tighten by 200.",
    phrases_to_avoid: "# Title or ## Section markdown headings anywhere; formulaic 'X is just A until we agree Y' parallel-structure philosophical closes; overusing 'That has to count for something' as a close (already used in umami + instant-coffee); the sourdough opener 'Santa isn't real' parenthetical is trying too hard",
    phrases_to_use_more: "concrete scene closes ('He adjusts the flame under the binchotan, checks the temperature of the rice, and goes back to work.' style); mid-article specific technical hooks anchored to a Malaysian bakery or scene",
  },
  {
    file: 'craft-beer.md',
    topic: 'Inside The Rise Of Malaysian Craft Beer',
    rating: 6,
    what_worked: "Strong Malaysia-specific real venue names: SS15, TTDI, Taps Beer Bar, Bricks & Barrels, Bintang Republik, Cyberjaya, Bangsar. Some Colin similes land: 'carbonated apologies', 'distilled the concept of a rainy afternoon into liquid form', 'an entire aisle focused to bottles of what is essentially wine that went wrong on purpose' (wait — that was in vinegar). Nice observation about the uncle trading Guinness for a session IPA.",
    what_to_improve: "This is the least Colin of the 5 gens. It reads like a straight magazine feature: chronological 'the first wave... then came the brewers... the taproom model took off next... Penang got in on it too' structure, long paragraphs (some over 150 words), industry-analysis tone. Colin's essays are shorter (900w typical), more textured with parenthetical asides, and structured around one central insight not a chronology. The gastronomic-curiosity skeleton may be pushing this — it says 'explore by region/type' which for a scene article turns into 'explore by wave'. Consider a scene-based skeleton for regional-scene articles: open on one specific taproom moment, use it as lens throughout. Also '**Inside The Rise Of Malaysian Craft Beer**' bold title at top. Two banned phrases slipped through: 'that's where things get interesting' and 'I'm not suggesting'. Both now added to colin-strip drop list.",
    phrases_to_avoid: "**Title** at top; chronological 'first wave / then came / next / took off' industry-history structure; 'that's where things get interesting'; 'I'm not suggesting X, but Y'; 'carved out a space, built a community, and proven that X' — triple-verb parallel close is AI-formula",
    phrases_to_use_more: "one specific taproom or bar scene as the article's anchor image; short paragraphs (3-4 sentences); parenthetical asides at least every 2 paragraphs; a personal Colin-voice reason to care rather than an industry-analyst pull-back",
  },
];

async function main() {
  const runDir = path.join(process.cwd(), 'data', 'iteration-runs', 'next-5');
  let saved = 0;
  for (const e of ENTRIES) {
    const articlePath = path.join(runDir, e.file);
    const article = existsSync(articlePath) ? readFileSync(articlePath, 'utf-8') : '';
    try {
      await saveFeedback({
        id: randomUUID(),
        topic: e.topic,
        article,
        timestamp: Date.now(),
        rating: e.rating,
        what_worked: e.what_worked,
        what_to_improve: e.what_to_improve,
        phrases_to_avoid: e.phrases_to_avoid,
        phrases_to_use_more: e.phrases_to_use_more,
      });
      saved++;
      console.log(`✓ ${e.file} (rating ${e.rating}/10)`);
    } catch (err) {
      console.error(`✗ ${e.file}: ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(`\nDone — ${saved}/${ENTRIES.length} feedback entries saved.`);
  console.log('Next Colin generation will inject these into the system prompt via buildFeedbackPrompt().');
}

main().catch(e => { console.error(e); process.exit(1); });
