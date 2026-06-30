// Scrape 10 ADDITIONAL CNN Travel articles, skipping any already in corpus.
// Pulls from /travel main + /travel/stay subsection for diversity.
// Run: npx tsx scripts/scrape-cnn-travel-more.ts

import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';

interface Article {
  title: string;
  url: string;
  date: string;
  publication: string;
  slug: string;
  full_text: string;
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const SEED_URLS = [
  'https://edition.cnn.com/travel',
  'https://edition.cnn.com/travel/stay',
  'https://edition.cnn.com/travel/news',
];
const TARGET_NEW = 10;
const OUT_DIR = path.join(process.cwd(), 'data', 'personas', 'cnn-travel', 'articles');
const EDITOR_C_DIR = path.join(process.cwd(), 'data', 'personas', 'editor-c', 'articles');

function fetchPage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('curl', [
      '-s', '-L', '-A', UA,
      '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      '-H', 'Accept-Language: en-US,en;q=0.9',
      '--compressed', '--max-time', '40', url,
    ], { maxBuffer: 20 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(err);
      if (!stdout) return reject(new Error('empty'));
      resolve(stdout);
    });
  });
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function extractUrls(html: string): string[] {
  const $ = cheerio.load(html);
  const urls = new Set<string>();
  $('a[href^="/travel/"]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    if (/^\/travel\/[a-z0-9-]+(\/[a-z0-9-]+)?$/i.test(href) &&
        !href.includes('/gallery/') && !href.includes('/category/') &&
        !href.includes('/page/') && !href.endsWith('/travel/') &&
        !href.endsWith('/travel/stay') && !href.endsWith('/travel/news')) {
      urls.add(`https://edition.cnn.com${href}`);
    }
  });
  return Array.from(urls);
}

function extractBody(html: string): { title: string; body: string; date: string } {
  const $ = cheerio.load(html);
  $('script, style, nav, footer, aside, .ad, .related-content').remove();

  const title = $('h1.headline__text, h1[data-editable="headlineText"], h1').first().text().trim()
    || $('meta[property="og:title"]').attr('content') || '';
  const date = $('meta[property="article:published_time"]').attr('content') || '';

  const paragraphs: string[] = [];
  $('[data-component-name="paragraph"]').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    if (t.length > 30) paragraphs.push(t);
  });

  return { title, body: paragraphs.join('\n\n'), date };
}

function existingSlugs(): Set<string> {
  if (!fs.existsSync(OUT_DIR)) return new Set();
  return new Set(
    fs.readdirSync(OUT_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace(/^cnn-/, '').replace(/\.json$/, ''))
  );
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(EDITOR_C_DIR, { recursive: true });

  const seen = existingSlugs();
  console.log(`Existing corpus: ${seen.size} articles. Need ${TARGET_NEW} new.`);

  // Fetch all seed pages, collect URLs
  const allCandidates = new Set<string>();
  for (const seed of SEED_URLS) {
    try {
      console.log(`Fetching seed: ${seed}`);
      const html = await fetchPage(seed);
      for (const u of extractUrls(html)) allCandidates.add(u);
      await new Promise(r => setTimeout(r, 1500));
    } catch (err) {
      console.warn(`  Failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(`Found ${allCandidates.size} candidate URLs across seeds.`);

  const articles: Article[] = [];
  for (const url of allCandidates) {
    if (articles.length >= TARGET_NEW) break;
    try {
      console.log(`Scraping: ${url}`);
      const html = await fetchPage(url);
      const { title, body, date } = extractBody(html);
      if (!title || body.split(/\s+/).length < 200) {
        console.log(`  Skipped (title='${title.slice(0, 40)}', wc=${body.split(/\s+/).length})`);
        continue;
      }
      const slug = slugify(title);
      if (seen.has(slug)) {
        console.log(`  Duplicate slug, skipping`);
        continue;
      }
      const article: Article = { title, url, date, publication: 'CNN Travel', slug, full_text: body };
      articles.push(article);
      seen.add(slug);

      const file = path.join(OUT_DIR, `cnn-${slug}.json`);
      fs.writeFileSync(file, JSON.stringify(article, null, 2));
      // Also copy to editor-c for parity
      fs.writeFileSync(path.join(EDITOR_C_DIR, `cnn-${slug}.json`), JSON.stringify(article, null, 2));
      console.log(`  ✓ Saved (${body.split(/\s+/).length} words) → ${path.basename(file)}`);

      await new Promise(r => setTimeout(r, 1500));
    } catch (err) {
      console.error(`  Failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\nDone. ${articles.length} new articles saved.`);
  console.log(`Total corpus now: ${seen.size} articles.`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
