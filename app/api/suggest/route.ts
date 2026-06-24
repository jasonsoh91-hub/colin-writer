import { NextRequest } from 'next/server';
import OpenAI from 'openai';
import { loadArticles } from '@/lib/scraper';
import { loadTaxonomy } from '@/lib/taxonomy';

function getClient() {
  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
  });
}

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const { topic, genre } = await req.json();
  if (!topic?.trim()) {
    return Response.json({ error: 'Topic required' }, { status: 400 });
  }

  // Pull Colin's actual article titles as context for what works
  const articles = loadArticles();
  const existingTitles = articles
    .map(a => a.title)
    .filter(Boolean)
    .slice(0, 30)
    .join('\n');

  const taxonomy = loadTaxonomy();
  const genreName = taxonomy?.genres?.find((g: { id: string }) => g.id === genre)?.name ?? genre ?? 'any genre';
  const genreExamples = taxonomy?.genres?.find((g: { id: string }) => g.id === genre)?.examples?.join(', ') ?? '';

  const prompt = `You are a topic strategist for Colin Gomez, Features Editor at Palate Asia (palateasia.com).

Colin's published article titles (for reference — avoid repeating these):
${existingTitles}

The user has a winning article topic: "${topic}"
Genre: ${genreName}${genreExamples ? ` (examples: ${genreExamples})` : ''}

Suggest 6 fresh article topics that:
1. Follow the same genre format and tone as the winning topic
2. Are relevant to Malaysian/KL food culture, restaurants, ingredients, or dining
3. Would appeal to Palate Asia's audience (food-curious, culturally aware, KL-based)
4. Have NOT been covered in the existing titles above
5. Match Colin's style — specific, a little surprising, not generic ("The Best Restaurants in KL" is too broad; "Kaya: The Jam That Launched A Thousand Breakfasts" is better)

Return ONLY a JSON array of 6 strings — the topic titles. No explanation, no numbering, no markdown. Just the array.
Example format: ["Topic One", "Topic Two", "Topic Three", "Topic Four", "Topic Five", "Topic Six"]`;

  try {
    const response = await getClient().chat.completions.create({
      model: 'anthropic/claude-sonnet-4-5',
      max_tokens: 400,
      temperature: 0.9,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? '[]';

    // Extract JSON array — handle model wrapping it in markdown
    const match = raw.match(/\[[\s\S]*\]/);
    const suggestions: string[] = match ? JSON.parse(match[0]) : [];

    return Response.json({ suggestions: suggestions.slice(0, 6) });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
