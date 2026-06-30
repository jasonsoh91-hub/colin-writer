import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { loadArticles } from './scraper';

function getClient() {
  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
  });
}

export async function extractStyleProfile(personaId: string = 'colin'): Promise<string> {
  const articles = loadArticles(personaId);
  if (articles.length === 0) throw new Error(`No articles found for persona '${personaId}'. Run scraper first.`);

  // Use up to 40 articles, 2000 chars each — stays under free tier token limit
  const corpus = articles
    .slice(0, 40)
    .map(a => `### ${a.title}\n\n${a.full_text.slice(0, 2000)}`)
    .join('\n\n---\n\n');

  const personaContext = personaId === 'colin'
    ? 'all written by Colin Gomez, Features Editor at Palate Asia'
    : `all from the ${articles[0]?.publication ?? personaId} corpus`;

  const response = await getClient().chat.completions.create({
    model: 'nvidia/nemotron-3-super-120b-a12b:free',
    max_tokens: 3000,
    messages: [
      {
        role: 'user',
        content: `You are a literary analyst specialising in editorial and feature journalism. Analyse the following ${articles.length} articles ${personaContext}, and extract a HIGHLY DETAILED writing style guide that an AI could use to write indistinguishably in this voice.

Cover ALL of the following sections with concrete quoted examples from the text:

## 1. OPENING PATTERNS
- Exactly how does he start articles? (rhetorical question? paradox? contradiction? provocative statement?)
- What is the structure of his first sentence?
- What does he NEVER do in an opener? (never starts with "The history of..." or "In today's world...")
- Quote 3 actual opening sentences from the articles

## 2. PARAGRAPH STRUCTURE
- How does each paragraph open? (location signal? rhetorical pivot? "As we.../ Moving to.../ Speaking of...")
- Average paragraph length: sentences and word count
- How does he end paragraphs? (punchy one-liner? open question? scene close?)

## 3. SENTENCE RHYTHM
- Where does he use short punchy sentences vs long literary ones?
- Quote 3 examples of his sentence rhythm (a long sentence followed by a short one)
- What punctuation patterns does he favour?

## 4. TRANSITIONS BETWEEN SECTIONS
- How does he move from one region/idea to the next?
- Exact transition phrases he uses repeatedly (quote them)

## 5. VOCABULARY FINGERPRINTS
- Signature phrases and expressions — quote the EXACT phrases (at least 15)
- Words he reaches for repeatedly
- What adjectives does he use? What adjectives does he NEVER use?
- Words he avoids ("delve", "furthermore", "in conclusion", "it is worth noting")

## 6. CULTURAL & HISTORICAL FRAMING
- How deep does he go into history? Where does he stop?
- Does he use academic language? Or does he keep it accessible?
- How does he introduce cultural context without sounding like Wikipedia?

## 7. WIT AND PERSONALITY
- Where in the article does dry wit appear? (opening, middle, close?)
- Quote 3 examples of his humour
- What he NEVER does for humour (no puns, no slapstick, no exclamation marks)

## 8. CLOSING PATTERNS
- How does he end articles? (philosophical reflection? personal note? call to action?)
- Does he use first person in the close?
- Tone of final paragraph — quiet and understated or grand and declarative?
- Quote 2 actual closing paragraphs

## 9. STRUCTURAL PATTERNS BY ARTICLE TYPE
- Gastronomic curiosity articles (exploring a dish/ingredient): what is the skeleton?
- Profile/interview articles: how does he structure them?
- Lifestyle/guide articles: how does he avoid listicle format?

## 10. ABSOLUTE RULES — WHAT HE NEVER DOES
- Format choices he always avoids
- Phrases that would instantly break his voice
- Structural traps (subheadings inside article body? bullet points? numbered lists?)

Output as a detailed markdown style guide. Include direct quotes from the articles as evidence for every claim.

ARTICLES (${articles.length} total):
${corpus}`,
      },
    ],
  });

  const profile = response.choices[0]?.message?.content ?? '';

  const outputPath = personaId === 'colin'
    ? path.join(process.cwd(), 'data', 'colin-style-profile.md')
    : path.join(process.cwd(), 'data', 'personas', personaId, 'profile.md');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, profile);
  console.log(`Style profile saved to ${outputPath}`);

  return profile;
}

export function loadStyleProfile(personaId: string = 'colin'): string {
  const filepath = personaId === 'colin'
    ? path.join(process.cwd(), 'data', 'colin-style-profile.md')
    : path.join(process.cwd(), 'data', 'personas', personaId, 'profile.md');
  if (!fs.existsSync(filepath)) return '';
  return fs.readFileSync(filepath, 'utf-8');
}
