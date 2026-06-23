import { NextRequest } from 'next/server';
import { saveFeedback, type FeedbackEntry } from '@/lib/feedback';
import { logFeedbackToSheets } from '@/lib/sheets';
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
    console.error('Feedback save failed:', err);
    return Response.json({ success: false, error: String(err) }, { status: 500 });
  }

  // Fire-and-forget — don't block on Sheets
  logFeedbackToSheets({
    topic: entry.topic,
    rating: entry.rating,
    what_worked: entry.what_worked,
    what_to_improve: entry.what_to_improve,
    phrases_to_avoid: entry.phrases_to_avoid,
    phrases_to_use_more: entry.phrases_to_use_more,
  });

  return Response.json({ success: true, id: entry.id });
}
