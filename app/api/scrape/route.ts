import { NextRequest } from 'next/server';
import { scrapePalateAsia, scrapeKnownArticles, saveArticles } from '@/lib/scraper';
import { extractStyleProfile } from '@/lib/style-extractor';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    let articles = await scrapePalateAsia();
    if (articles.length === 0) {
      articles = await scrapeKnownArticles();
    }

    if (articles.length === 0) {
      return Response.json({ error: 'No articles scraped' }, { status: 500 });
    }

    saveArticles(articles);
    const profile = await extractStyleProfile();

    return Response.json({
      articlesCount: articles.length,
      articles: articles.map(a => ({ title: a.title, url: a.url, publication: a.publication })),
      profileLength: profile.length,
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
