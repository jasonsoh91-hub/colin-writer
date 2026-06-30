// Dump clean reference articles (post-strip) for side-by-side diff against generated output.
import { loadArticles } from '../lib/scraper';
import * as fs from 'fs';
import * as path from 'path';

const SLUGS = ['all-about-butter', 'kitchen-tools-you-need', 'how-capsaicin-works', 'iconic-chef-dish', 'coffee-species-guide-arabica-and-robusta'];

const out = path.join(process.cwd(), 'data', 'iteration-runs', '_refs');
fs.mkdirSync(out, { recursive: true });

for (const slug of SLUGS) {
  const articles = loadArticles('colin');
  const a = articles.find(x => x.slug === slug);
  if (!a) {
    console.log(`MISSING: ${slug}`);
    continue;
  }
  // Strip nav prefix more aggressively for diff readability.
  let txt = a.full_text;
  // Trim trailing Palate Asia related-posts boilerplate
  const tail = txt.indexOf('TrendingLatest');
  if (tail !== -1) txt = txt.slice(0, tail).trim();
  const tail2 = txt.indexOf('Previous Post');
  if (tail2 !== -1) txt = txt.slice(0, tail2).trim();
  fs.writeFileSync(path.join(out, `${slug}.txt`), `# ${a.title}\n\n${txt}\n`);
  console.log(`Wrote ${slug}.txt — ${txt.split(/\s+/).length} words`);
}
