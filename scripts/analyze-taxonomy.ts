import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
});

interface Article { title: string; url: string; full_text: string; }

const dir = path.join(process.cwd(), 'data/articles_v2');
const articles: Article[] = fs.readdirSync(dir)
  .filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')));

const corpus = articles
  .map(a => `---\nARTICLE: ${a.title}\nURL: ${a.url}\nEXCERPT: ${a.full_text.slice(0, 400)}`)
  .join('\n');

const prompt = `You are analyzing ALL published articles by Colin Gomez (Features Editor, Palate Asia) to build a complete writer profile for an AI content generation tool.

Here are all ${articles.length} of his articles with excerpts:
${corpus}

Provide a detailed JSON analysis. Output ONLY valid JSON, no markdown fences, no explanation:

{
  "genres": [
    {
      "id": "string (kebab-case)",
      "name": "string",
      "description": "string",
      "examples": ["article title 1", "article title 2"],
      "tone_id": "string",
      "typical_length": "string e.g. 600-800 words",
      "structure": "string e.g. Hook → History → Insight → Close",
      "depth": "light or moderate or deep",
      "prompt_instruction": "Specific 2-3 sentence instruction for AI on HOW to write this genre in Colin's voice"
    }
  ],
  "tones": [
    {
      "id": "string (kebab-case)",
      "name": "string",
      "description": "string",
      "markers": ["example phrase or structural pattern that signals this tone"]
    }
  ],
  "style_options": {
    "historical_depth": [{"id":"none","label":"No history — get straight to the point"},{"id":"light","label":"Light historical touch"},{"id":"deep","label":"Deep cultural history — origin stories, class, colonial context"}],
    "wit_level": [{"id":"dry","label":"Dry & deadpan (his default)"},{"id":"moderate","label":"Moderate — wit surfaces occasionally"},{"id":"minimal","label":"Minimal — serious and informative"}],
    "cultural_framing": [{"id":"local","label":"Local Malaysia / KL focus"},{"id":"regional","label":"Regional Asia context"},{"id":"global","label":"Global cultural lens"}],
    "pov": [{"id":"first","label":"First person — I am here, I tried this"},{"id":"observer","label":"Observer — watching from outside"},{"id":"hybrid","label":"Hybrid — shifts between"}]
  },
  "opening_hook_types": [
    {"id":"string","label":"string","description":"string","example":"a real or illustrative example opening line"}
  ],
  "never_does": ["specific pattern or phrase Colin never uses — be concrete"],
  "always_does": ["specific pattern Colin always does — be concrete"],
  "signature_phrases": ["actual phrases or constructions from his writing"],
  "article_type_prompts": {
    "genre-id": "Detailed 3-4 sentence writing instruction for AI to match this genre perfectly"
  }
}`;

async function main() {
  console.log(`Analyzing ${articles.length} articles...`);
  const resp = await client.chat.completions.create({
    model: 'google/gemma-4-31b-it:free',
    max_tokens: 2500,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = resp.choices[0]?.message?.content ?? '';
  // Extract JSON block — model may include reasoning text before/after
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('No JSON found in response. Raw output:');
    console.error(raw.slice(0, 1000));
    process.exit(1);
  }
  const result = jsonMatch[0];
  // Validate
  JSON.parse(result);
  const outPath = path.join(process.cwd(), 'data/colin-taxonomy.json');
  fs.writeFileSync(outPath, result);
  console.log(`\nSaved taxonomy to ${outPath}`);
  const parsed = JSON.parse(result);
  console.log(`\nGenres found: ${parsed.genres?.length}`);
  console.log(`Tones found: ${parsed.tones?.length}`);
  parsed.genres?.forEach((g: { name: string; examples: string[] }) => console.log(`  - ${g.name}: ${g.examples?.join(', ')}`.slice(0, 80)));
}

main().catch(console.error);
