import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';

export interface Article {
  title: string;
  url: string;
  date: string;
  publication: string;
  slug: string;
  full_text: string;
}

async function fetchPage(url: string): Promise<string> {
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
      if (err) return reject(new Error(`curl failed for ${url}: ${stderr}`));
      if (!stdout) return reject(new Error(`Empty response for ${url}`));
      resolve(stdout);
    });
  });
}

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function scrapePalateAsiaArticle(url: string): Promise<string> {
  const html = await fetchPage(url);
  const $ = cheerio.load(html);

  // Remove nav, footer, ads, related posts
  $('nav, footer, .related-posts, .sidebar, script, style, .advertisement').remove();

  // Palate Asia uses standard article body
  const selectors = [
    'article .entry-content',
    '.post-content',
    '.article-content',
    '.entry-content',
    'article',
  ];

  for (const sel of selectors) {
    const el = $(sel);
    if (el.length && el.text().trim().length > 200) {
      return el.text().replace(/\s+/g, ' ').trim();
    }
  }

  return $('body').text().replace(/\s+/g, ' ').trim();
}

export async function scrapePalateAsia(): Promise<Article[]> {
  console.log('Scraping palateasia.com/colin-gomez/ ...');
  const html = await fetchPage('https://palateasia.com/colin-gomez/');
  const $ = cheerio.load(html);

  const articles: Article[] = [];
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);

  // Collect article links from author page
  const articleLinks: { url: string; title: string; date: string }[] = [];

  $('article, .post, .entry').each((_, el) => {
    const link = $(el).find('a[href]').first().attr('href') || '';
    const title = $(el).find('h1, h2, h3, .entry-title, .post-title').first().text().trim();
    const dateStr = $(el).find('time, .date, .post-date, .entry-date').first().attr('datetime')
      || $(el).find('time, .date, .post-date, .entry-date').first().text().trim();

    if (link && title && link.includes('palateasia.com')) {
      articleLinks.push({ url: link, title, date: dateStr });
    }
  });

  // Also check for links in general content if above finds nothing
  if (articleLinks.length === 0) {
    $('a[href*="palateasia.com"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text().trim();
      if (href && text.length > 10 && !href.includes('/category/') && !href.includes('/tag/') && !href.includes('/page/')) {
        articleLinks.push({ url: href, title: text, date: '' });
      }
    });
  }

  console.log(`Found ${articleLinks.length} article links on author page`);

  // Scrape each article
  for (const link of articleLinks) {
    try {
      console.log(`  Scraping: ${link.title || link.url}`);
      const full_text = await scrapePalateAsiaArticle(link.url);
      const slug = slugify(link.title || link.url);

      articles.push({
        title: link.title,
        url: link.url,
        date: link.date,
        publication: 'Palate Asia',
        slug,
        full_text,
      });

      // Polite delay
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.error(`  Failed: ${link.url} — ${err}`);
    }
  }

  return articles;
}

export async function scrapeKnownArticles(): Promise<Article[]> {
  // Fallback: scrape known Colin URLs directly from search results
  const known = [
    { url: 'https://palateasia.com/inside-the-curious-world-of-porcupine-meat/', title: 'Inside The Curious World Of Porcupine Meat' },
    { url: 'https://palateasia.com/inside-the-kafana/', title: 'Inside The Kafana: The Cultural Heart Of The Balkans' },
    { url: 'https://palateasia.com/bak-kut-teh-facts-closer-look/', title: 'These Bak Kut Teh Facts Will Capture Your Heart And Stomach' },
    { url: 'http://palateasia.com/how-to-build-the-charcuterie-board-of-your-and-everyone-elses-dreams/', title: 'How To Build The Charcuterie Board Of Your Dreams' },
    { url: 'http://palateasia.com/lihing-sabahs-hidden-gem-of-traditional-rice-wine/', title: 'Lihing: Sabah\'s Hidden Gem Of Traditional Rice Wine' },
    { url: 'https://palateasia.com/quick-and-easy-air-fryer-recipes-for-the-chronically-stove-averse/', title: 'Quick And Easy Air Fryer Recipes For The Chronically Stove-Averse' },
    { url: 'https://palateasia.com/inside-bar-terumi-a-conversation-with-shirmy-chan/', title: 'Inside Bar Terumi: A Conversation With Shirmy Chan' },
  ];

  const articles: Article[] = [];

  for (const item of known) {
    try {
      console.log(`  Scraping: ${item.title}`);
      const full_text = await scrapePalateAsiaArticle(item.url);
      articles.push({
        title: item.title,
        url: item.url,
        date: '',
        publication: 'Palate Asia',
        slug: slugify(item.title),
        full_text,
      });
      await new Promise(r => setTimeout(r, 1500));
    } catch (err) {
      console.error(`  Failed: ${item.url} — ${err}`);
    }
  }

  return articles;
}

export function saveArticles(articles: Article[]): void {
  const dir = path.join(process.cwd(), 'data', 'articles');
  fs.mkdirSync(dir, { recursive: true });

  for (const article of articles) {
    const filepath = path.join(dir, `colin-${article.slug}.json`);
    fs.writeFileSync(filepath, JSON.stringify(article, null, 2));
    console.log(`Saved: ${filepath}`);
  }
}

export function loadArticles(): Article[] {
  // Prefer articles_v3 (58-article scrape) → v2 → v1
  const dirs = ['data/articles_v3', 'data/articles_v2', 'data/articles'].map(d => path.join(process.cwd(), d));
  const dir = dirs.find(d => fs.existsSync(d)) ?? dirs[1];

  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')));
}
