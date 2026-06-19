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

export async function extractStyleProfile(): Promise<string> {
  const articles = loadArticles();
  if (articles.length === 0) throw new Error('No articles found. Run scraper first.');

  const corpus = articles
    .slice(0, 6)
    .map(a => `### ${a.title}\n\n${a.full_text.slice(0, 1200)}`)
    .join('\n\n---\n\n');

  const response = await getClient().chat.completions.create({
    model: 'nvidia/nemotron-3-super-120b-a12b:free',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: `You are a writing style analyst. Analyze the following articles all written by Colin Gomez and extract a detailed writing style profile that could be used to instruct an AI to write in his exact voice.

Focus on:
1. Opening hook patterns (how does he start articles?)
2. Sentence rhythm and length variety
3. Structural pattern (how does each piece move?)
4. Signature vocabulary and phrases
5. Cultural/historical framing approach
6. Tone and personality markers
7. How he handles transitions
8. How he closes articles
9. What he NEVER does (listicles? clinical descriptions? etc.)

Output a detailed style guide in markdown that an AI could follow to impersonate his writing voice precisely.

ARTICLES:
${corpus}`,
      },
    ],
  });

  const profile = response.choices[0]?.message?.content ?? '';

  const outputPath = path.join(process.cwd(), 'data', 'colin-style-profile.md');
  fs.writeFileSync(outputPath, profile);
  console.log(`Style profile saved to ${outputPath}`);

  return profile;
}

export function loadStyleProfile(): string {
  const filepath = path.join(process.cwd(), 'data', 'colin-style-profile.md');
  if (!fs.existsSync(filepath)) return '';
  return fs.readFileSync(filepath, 'utf-8');
}
