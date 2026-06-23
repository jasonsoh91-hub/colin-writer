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
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
  } catch (err) {
    console.error('Sheets log failed:', err);
  }
}
