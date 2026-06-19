import { scrapePalateAsia, scrapeKnownArticles, saveArticles, type Article } from '../lib/scraper';
import { extractStyleProfile } from '../lib/style-extractor';

async function main() {
  console.log('=== Colin Gomez Article Scraper ===\n');

  // Try author page first, fall back to known URLs
  let articles: Awaited<ReturnType<typeof scrapePalateAsia>> = [];
  try {
    articles = await scrapePalateAsia();
  } catch (err) {
    console.log(`Author page failed (${err}). Using known article list...`);
  }

  if (articles.length === 0) {
    console.log('Using known article list...');
    articles = await scrapeKnownArticles();
  }

  if (articles.length === 0) {
    console.error('No articles scraped. Check connectivity or article URLs.');
    process.exit(1);
  }

  console.log(`\nScraped ${articles.length} articles.`);
  saveArticles(articles);

  if (process.env.ANTHROPIC_API_KEY) {
    console.log('\nExtracting style profile with Claude...');
    await extractStyleProfile();
    console.log('\nDone. Ready to generate articles.');
  } else {
    console.log('\nSkipping style extraction — ANTHROPIC_API_KEY not set.');
    console.log('Add it to .env.local then run: npx tsx scripts/extract-style.ts');
  }
}

main().catch(console.error);
