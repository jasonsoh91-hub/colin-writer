import { NextRequest } from 'next/server';
import { generateArticle } from '@/lib/generator';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { topic, options } = await req.json();

  if (!topic?.trim()) {
    return new Response(JSON.stringify({ error: 'Topic is required' }), { status: 400 });
  }

  const stream = await generateArticle(topic.trim(), options ?? {});

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
    },
  });
}
