import { readFileSync, existsSync } from 'fs';
if (existsSync('.env.local')) {
  const env = readFileSync('.env.local', 'utf-8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

import { scoreTextWithPerplexity } from '../lib/score';
import { loadArticles } from '../lib/scraper';

async function main() {
  const articles = loadArticles();
  const colinSamples = articles
    .filter(a => a.full_text.length > 1500 && a.full_text.length < 4000)
    .slice(0, 3);

  const pureAI = `In today's rapidly evolving culinary landscape, the role of traditional ingredients cannot be overstated. As we delve into the rich tapestry of Malaysian cuisine, it becomes evident that each ingredient plays a pivotal role in shaping our gastronomic experiences. Belacan, a quintessential component, exemplifies this notion. Its robust flavor profile underscores the intricate balance of taste that defines authentic Malaysian dishes. Furthermore, the careful selection and preparation of belacan are crucial to unlocking its full potential. By understanding the nuances of this remarkable ingredient, we can elevate our cooking and create truly memorable meals. Moreover, the cultural significance of belacan extends beyond mere flavor; it represents a connection to our heritage and culinary traditions. In conclusion, embracing the use of belacan in our cooking not only enhances our dishes but also honors the rich legacy of Malaysian cuisine. Subsequently, we should strive to incorporate this ingredient thoughtfully, allowing its unique characteristics to shine through.`;

  const userFailing = `For a lot of us who cook at home, there's comfort in knowing what goes where. Belacan in sambal. Lemongrass in tom yam. Pandan in kuih. We've spent years watching our mothers and grandmothers work these ingredients into meals, and somewhere along the way, we picked up the patterns. But some of those patterns might not be doing the ingredient justice. Not because anyone taught us wrong, but because we've stopped questioning why we do it that way in the first place. The principle is simple enough. An ingredient is only as good as how you use it. Most of the time, we're working off muscle memory rather than curiosity.`;

  console.log('=== Colin real articles (expect LOW score) ===');
  for (const a of colinSamples) {
    const s = await scoreTextWithPerplexity(a.full_text);
    console.log(`  ${a.title.slice(0, 50)}: ${s.score}/100 (${s.label}), AI prob: ${((s.breakdown.perplexity ?? 0) * 100).toFixed(1)}%`);
  }

  console.log('\n=== Pure ChatGPT-style (expect HIGH score) ===');
  const ai = await scoreTextWithPerplexity(pureAI);
  console.log(`  ${ai.score}/100 (${ai.label}), AI prob: ${((ai.breakdown.perplexity ?? 0) * 100).toFixed(1)}%`);

  console.log('\n=== User failing humanized (87% GPTZero, expect HIGH score) ===');
  const u = await scoreTextWithPerplexity(userFailing);
  console.log(`  ${u.score}/100 (${u.label}), AI prob: ${((u.breakdown.perplexity ?? 0) * 100).toFixed(1)}%`);
}
main().catch(console.error);
