import { readFileSync, existsSync } from 'fs';
if (existsSync('.env.local')) {
  const env = readFileSync('.env.local', 'utf-8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

async function main() {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.allowLocalModels = false;
  env.useBrowserCache = false;
  const detector = await pipeline('text-classification', 'onnx-community/answerdotai-ModernBERT-base-ai-detector-ONNX');

  // Load a real Colin article (human ground truth)
  const { loadArticles } = await import('../lib/scraper');
  const articles = loadArticles();
  const colinArticle = articles.find(a => a.full_text.length > 1500 && a.full_text.length < 4000);

  const samples: { label: string; text: string }[] = [];
  if (colinArticle) {
    samples.push({ label: `HUMAN: Colin article "${colinArticle.title}"`, text: colinArticle.full_text.slice(0, 2000) });
  }

  // Pure AI sample (un-humanized, long)
  samples.push({
    label: 'AI: long pure ChatGPT-style',
    text: `In today's rapidly evolving culinary landscape, the role of traditional ingredients cannot be overstated. As we delve into the rich tapestry of Malaysian cuisine, it becomes evident that each ingredient plays a pivotal role in shaping our gastronomic experiences. Belacan, a quintessential component, exemplifies this notion. Its robust flavor profile underscores the intricate balance of taste that defines authentic Malaysian dishes. Furthermore, the careful selection and preparation of belacan are crucial to unlocking its full potential. By understanding the nuances of this remarkable ingredient, we can elevate our cooking and create truly memorable meals. Moreover, the cultural significance of belacan extends beyond mere flavor; it represents a connection to our heritage and culinary traditions. In conclusion, embracing the use of belacan in our cooking not only enhances our dishes but also honors the rich legacy of Malaysian cuisine. Subsequently, we should strive to incorporate this ingredient thoughtfully, allowing its unique characteristics to shine through. Ultimately, the journey of understanding and appreciating belacan is a testament to our commitment to preserving and celebrating the diverse flavors of our culinary heritage.`,
  });

  // User's failing article (humanized but GPTZero 87% AI)
  samples.push({
    label: 'USER FAILING: humanized but 87% GPTZero AI',
    text: `For a lot of us who cook at home, there's comfort in knowing what goes where. Belacan in sambal. Lemongrass in tom yam. Pandan in kuih. We've spent years watching our mothers and grandmothers work these ingredients into meals, and somewhere along the way, we picked up the patterns. But some of those patterns might not be doing the ingredient justice. Not because anyone taught us wrong, but because we've stopped questioning why we do it that way in the first place. The principle is simple enough. An ingredient is only as good as how you use it. Most of the time, we're working off muscle memory rather than curiosity. So here are three Malaysian staples that deserve a second look. You toss it into sambal and stir it into curries. Fine. But you're probably adding it too early. The thing about belacan is that its flavour compounds are volatile. They evaporate when exposed to prolonged heat.`,
  });

  for (const s of samples) {
    const r = await detector(s.text, { top_k: 2 } as object);
    console.log(`\n=== ${s.label} ===`);
    console.log(JSON.stringify(r, null, 2));
  }
}
main().catch(console.error);
