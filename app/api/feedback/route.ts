import { NextRequest } from 'next/server';
import { saveFeedback, type FeedbackEntry } from '@/lib/feedback';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json();

  const entry: FeedbackEntry = {
    id: randomUUID(),
    topic: body.topic ?? '',
    timestamp: Date.now(),
    article: body.article ?? '',
    rating: Number(body.rating) || 5,
    what_worked: body.what_worked ?? '',
    what_to_improve: body.what_to_improve ?? '',
    phrases_to_avoid: body.phrases_to_avoid ?? '',
    phrases_to_use_more: body.phrases_to_use_more ?? '',
  };

  try {
    await saveFeedback(entry);
  } catch (err) {
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }

  return Response.json({ success: true, id: entry.id });
}
