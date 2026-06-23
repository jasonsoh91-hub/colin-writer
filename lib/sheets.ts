export async function logFeedbackToSheets(entry: {
  topic: string;
  rating: number;
  what_worked: string;
  what_to_improve: string;
  phrases_to_avoid: string;
  phrases_to_use_more: string;
}): Promise<void> {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK;
  if (!webhookUrl) return;
  try {
    const params = new URLSearchParams({
      topic: entry.topic,
      rating: String(entry.rating),
      what_worked: entry.what_worked,
      what_to_improve: entry.what_to_improve,
      phrases_to_avoid: entry.phrases_to_avoid,
      phrases_to_use_more: entry.phrases_to_use_more,
    });
    await fetch(`${webhookUrl}?${params.toString()}`, { method: 'GET', redirect: 'follow' });
  } catch (err) {
    console.error('Sheets log failed:', err);
  }
}
