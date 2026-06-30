// Scrape CNN Travel articles for the CNN Travel persona corpus.
// Run: npx tsx scripts/scrape-cnn-travel.ts
//
// 1. Fetch CNN Travel landing
// 2. Extract /travel/* article URLs
// 3. Scrape each article's body via data-component-name="paragraph"
// 4. Save 20 articles to data/personas/cnn-travel/articles/*.json

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

function fetchPage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('curl', [
      '-s', '-L', '-A', UA,
      '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      '-H', 'Accept-Language: en-US,en;q=0.9',
      '--compressed', '--max-time', '40',
      url,
    ], { maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`curl failed for ${url}: ${stderr}`));
      if (!stdout) return reject(new Error(`Empty response for ${url}`));
      resolve(stdout);
    });
  });
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function extractArticleUrls(html: string): string[] {
  const $ = cheerio.load(html);
  const urls = new Set<string>();

  $('a[href^="/travel/"]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    // Filter to article-like paths only (skip category/gallery/index pages)
    if (/^\/travel\/[a-z0-9-]+(\/[a-z0-9-]+)?$/i.test(href) &&
        !href.includes('/gallery/') &&
        !href.includes('/category/') &&
        !href.includes('/page/') &&
        !href.endsWith('/travel/')) {
      urls.add(`https://edition.cnn.com${href}`);
    }
  });

  return Array.from(urls);
}

function extractArticleBody(html: string): { title: string; body: string; date: string } {
  const $ = cheerio.load(html);

  // Strip noise upfront
  $('script, style, nav, footer, aside, .ad, .related-content, .placeholder').remove();

  const title = $('h1.headline__text, h1[data-editable="headlineText"], h1').first().text().trim()
    || $('meta[property="og:title"]').attr('content')
    || '';

  const date = $('meta[property="article:published_time"]').attr('content')
    || $('div.timestamp').text().trim()
    || '';

  // CNN article paragraphs use data-component-name="paragraph"
  const paragraphs: string[] = [];
  $('[data-component-name="paragraph"]').each((_, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    if (t.length > 30) paragraphs.push(t);
  });

  // Fallback: try .article__content paragraphs
  if (paragraphs.length === 0) {
    $('.article__content p, .zn-body__paragraph').each((_, el) => {
      const t = $(el).text().replace(/\s+/g, ' ').trim();
      if (t.length > 30) paragraphs.push(t);
    });
  }

  const body = paragraphs.join('\n\n');
  return { title, body, date };
}

async function main() {
  const targetCount = 20;
  const outDir = path.join(process.cwd(), 'data', 'personas', 'cnn-travel', 'articles');
  fs.mkdirSync(outDir, { recursive: true });

  console.log('Fetching CNN Travel landing...');
  const landing = await fetchPage('https://edition.cnn.com/travel');
  const urls = extractArticleUrls(landing);
  console.log(`Found ${urls.length} article candidates.`);

  if (urls.length < targetCount) {
    console.warn(`Warning: only ${urls.length} candidates, need ${targetCount}. Will scrape what's available.`);
  }

  const articles: Article[] = [];
  for (const url of urls) {
    if (articles.length >= targetCount) break;
    try {
      console.log(`Scraping: ${url}`);
      const html = await fetchPage(url);
      const { title, body, date } = extractArticleBody(html);

      if (!title || body.split(/\s+/).length < 200) {
        console.log(`  Skipped (title='${title.slice(0, 40)}', wc=${body.split(/\s+/).length})`);
        continue;
      }

      const slug = slugify(title);
      articles.push({
        title, url, date,
        publication: 'CNN Travel',
        slug,
        full_text: body,
      });

      const file = path.join(outDir, `cnn-${slug}.json`);
      fs.writeFileSync(file, JSON.stringify(articles[articles.length - 1], null, 2));
      console.log(`  ✓ Saved (${body.split(/\s+/).length} words) → ${path.basename(file)}`);

      // Polite delay
      await new Promise(r => setTimeout(r, 1500));
    } catch (err) {
      console.error(`  Failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\nDone. ${articles.length} CNN Travel articles saved to ${outDir}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
