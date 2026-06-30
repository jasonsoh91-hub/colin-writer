// One-shot: scrape the 3 newest Colin articles missing from the corpus and
// drop them into data/articles_v3/ so the generator + analyzer see them as
// ground truth. Re-runnable — overwrites existing files.

import { scrapePalateAsiaArticle } from '../lib/scraper';
import * as fs from 'fs';
import * as path from 'path';

const MISSING = [
  {
    url: 'https://palateasia.com/iconic-chef-dish/',
    title: "Inside Three Of The World's Most Famous Chef Dishes",
    slug: 'iconic-chef-dish',
  },
  {
    url: 'https://palateasia.com/coffee-species-guide-arabica-and-robusta/',
    title: "Coffee Species Guide: What's Really In Your Cup",
    slug: 'coffee-species-guide-arabica-and-robusta',
  },
  {
    url: 'https://palateasia.com/all-about-butter/',
    title: 'All About Butter',
    slug: 'all-about-butter',
  },
];

async function main() {
  const dir = path.join(process.cwd(), 'data', 'articles_v3');
  fs.mkdirSync(dir, { recursive: true });

  for (const m of MISSING) {
    process.stdout.write(`Scraping ${m.slug} ... `);
    try {
      const full_text = await scrapePalateAsiaArticle(m.url);
      const out = {
        title: m.title,
        url: m.url,
        date: '',
        publication: 'Palate Asia',
        slug: m.slug,
        full_text,
      };
      const fp = path.join(dir, `colin-${m.slug}.json`);
      fs.writeFileSync(fp, JSON.stringify(out, null, 2));
      console.log(`OK (${full_text.split(/\s+/).length} words) → ${fp}`);
      await new Promise(r => setTimeout(r, 1500));
    } catch (err) {
      console.log(`FAILED — ${err instanceof Error ? err.message : err}`);
    }
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
