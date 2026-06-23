import { scrapePalateAsiaArticle, saveArticles, type Article } from '../lib/scraper';
import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

function fetchPage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('curl', [
      '-s', '-L',
      '-A', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      '-H', 'Accept-Language: en-US,en;q=0.9',
      '--compressed',
      '--max-time', '30',
      url,
    ], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`curl failed: ${stderr}`));
      resolve(stdout);
    });
  });
}

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function extractArticleLinks(html: string): { url: string; title: string }[] {
  const links: { url: string; title: string }[] = [];
  const seen = new Set<string>();

  // Match href links to palateasia.com article paths
  const hrefRegex = /href="(https?:\/\/palateasia\.com\/[a-z0-9][a-z0-9-]+\/)"/g;
  let m: RegExpExecArray | null;

  const skip = new Set([
    'about-us', 'contact', 'home', 'hot-posts', 'feed', 'comments',
    'category', 'tag', 'author', 'page', 'advertise', 'privacy',
  ]);

  while ((m = hrefRegex.exec(html)) !== null) {
    const url = m[1].replace(/\/$/, '') + '/';
    if (seen.has(url)) continue;
    const slug = url.replace('https://palateasia.com/', '').replace(/\/$/, '');
    const parts = slug.split('/');
    if (parts.length !== 1) continue; // skip nested paths
    if (skip.has(parts[0])) continue;
    if (parts[0].length < 5) continue;
    seen.add(url);

    // Extract title from nearby <h2> or <h3> in surrounding context
    const pos = html.indexOf(m[0]);
    const surrounding = html.slice(Math.max(0, pos - 500), pos + 500);
    const titleMatch = surrounding.match(/<(?:h[123]|a)[^>]*class="[^"]*(?:entry-title|post-title)[^"]*"[^>]*>([^<]+)</) ||
                       surrounding.match(/<(?:h[123])[^>]*>([^<]{10,100})<\//);
    const title = titleMatch ? titleMatch[1].trim() : slug.replace(/-/g, ' ');

    links.push({ url, title });
  }

  return links;
}

async function main() {
  const TOTAL_PAGES = 6;
  const allLinks: { url: string; title: string }[] = [];
  const seen = new Set<string>();

  console.log(`Crawling ${TOTAL_PAGES} pages of palateasia.com/author/colin/ ...`);

  for (let page = 1; page <= TOTAL_PAGES; page++) {
    const url = page === 1
      ? 'https://palateasia.com/author/colin/'
      : `https://palateasia.com/author/colin/page/${page}/`;
    console.log(`  Page ${page}: ${url}`);
    try {
      const html = await fetchPage(url);
      const links = extractArticleLinks(html);
      for (const link of links) {
        if (!seen.has(link.url)) {
          seen.add(link.url);
          allLinks.push(link);
        }
      }
      console.log(`    Found ${links.length} links (${allLinks.length} total so far)`);
    } catch (err) {
      console.error(`    Page ${page} failed: ${err}`);
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\nTotal unique article URLs: ${allLinks.length}`);
  console.log('Starting article scrapes...\n');

  // Save to articles_v3
  const outDir = path.join(process.cwd(), 'data', 'articles_v3');
  fs.mkdirSync(outDir, { recursive: true });

  let success = 0;
  let failed = 0;

  for (const link of allLinks) {
    try {
      process.stdout.write(`  Scraping: ${link.title.slice(0, 60)}... `);
      const full_text = await scrapePalateAsiaArticle(link.url);
      if (full_text.length < 100) {
        console.log('SKIP (too short)');
        failed++;
        continue;
      }
      const slug = slugify(link.title || link.url);
      const article: Article = {
        title: link.title,
        url: link.url,
        date: '',
        publication: 'Palate Asia',
        slug,
        full_text,
      };
      const filepath = path.join(outDir, `colin-${slug}.json`);
      fs.writeFileSync(filepath, JSON.stringify(article, null, 2));
      console.log(`OK (${full_text.split(' ').length}w)`);
      success++;
    } catch (err) {
      console.log(`FAILED: ${err}`);
      failed++;
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`\nDone. ${success} saved, ${failed} failed.`);
  console.log(`Articles saved to data/articles_v3/`);
  console.log(`\nNext: run "npx tsx scripts/extract-style.ts" to rebuild style profile`);
}

main().catch(console.error);
