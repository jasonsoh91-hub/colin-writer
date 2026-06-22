import { NextRequest } from 'next/server';
import { computeSimilarity } from '@/lib/analyzer';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const { article } = await req.json();
  if (!article?.trim()) {
    return Response.json({ error: 'No article provided' }, { status: 400 });
  }
  const report = await computeSimilarity(article);
  return Response.json(report);
}
