import { NextRequest } from 'next/server';
import { scoreText, scoreTextWithPerplexity } from '@/lib/score';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { text, fast } = await req.json();
  if (!text?.trim()) {
    return Response.json({ error: 'Text required' }, { status: 400 });
  }
  if (fast) return Response.json(scoreText(text));
  return Response.json(await scoreTextWithPerplexity(text));
}
