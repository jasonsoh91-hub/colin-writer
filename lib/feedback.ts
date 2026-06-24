import { createClient } from '@supabase/supabase-js';

export interface FeedbackEntry {
  id: string;
  topic: string;
  timestamp: number;
  article: string;
  rating: number;
  what_worked: string;
  what_to_improve: string;
  phrases_to_avoid: string;
  phrases_to_use_more: string;
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  return createClient(url, key);
}

export async function saveFeedback(entry: FeedbackEntry): Promise<void> {
  const { error } = await getSupabase()
    .from('colin_feedback')
    .insert({
      id: entry.id,
      topic: entry.topic,
      article: entry.article,
      rating: entry.rating,
      what_worked: entry.what_worked,
      what_to_improve: entry.what_to_improve,
      phrases_to_avoid: entry.phrases_to_avoid,
      phrases_to_use_more: entry.phrases_to_use_more,
      created_at: new Date(entry.timestamp).toISOString(),
    });
  if (error) throw new Error(`Supabase insert failed: ${error.message}`);
}

export async function loadAllFeedback(): Promise<FeedbackEntry[]> {
  const { data, error } = await getSupabase()
    .from('colin_feedback')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Supabase select failed: ${error.message}`);
  return (data ?? []).map(row => ({
    id: row.id,
    topic: row.topic,
    article: row.article,
    timestamp: new Date(row.created_at).getTime(),
    rating: row.rating,
    what_worked: row.what_worked ?? '',
    what_to_improve: row.what_to_improve ?? '',
    phrases_to_avoid: row.phrases_to_avoid ?? '',
    phrases_to_use_more: row.phrases_to_use_more ?? '',
  }));
}

export async function buildFeedbackPrompt(): Promise<string> {
  let allEntries: FeedbackEntry[];
  try {
    allEntries = await loadAllFeedback();
  } catch {
    return '';
  }
  if (allEntries.length === 0) return '';

  // Most recent 8 reviews only — older feedback becomes stale as voice improves
  const entries = allEntries.slice(-8);
  const recent = entries.slice(-3); // last 3 get highest weight in framing

  const avgRating = (allEntries.reduce((s, e) => s + e.rating, 0) / allEntries.length).toFixed(1);
  const recentAvg = (recent.reduce((s, e) => s + e.rating, 0) / recent.length).toFixed(1);

  const trend = allEntries.length >= 2
    ? allEntries[allEntries.length - 1].rating > allEntries[0].rating ? '↑ improving' : '→ flat'
    : '';

  const worked = entries.filter(e => e.what_worked.trim()).map(e => `- ${e.what_worked.trim()}`).join('\n');
  const improve = entries.filter(e => e.what_to_improve.trim()).map(e => `- ${e.what_to_improve.trim()}`).join('\n');
  const avoidPhrases = entries.filter(e => e.phrases_to_avoid.trim()).map(e => `- ${e.phrases_to_avoid.trim()}`).join('\n');
  const usePhrases = entries.filter(e => e.phrases_to_use_more.trim()).map(e => `- ${e.phrases_to_use_more.trim()}`).join('\n');

  // Surface the most recent critical feedback prominently
  const lastImprove = recent.filter(e => e.what_to_improve.trim()).map(e => `- ${e.what_to_improve.trim()}`).join('\n');

  return `
## Feedback Loop — ${allEntries.length} Review(s) | avg ${avgRating}/10 | recent ${recentAvg}/10 ${trend}

### MOST CRITICAL — Last 3 Reviews Said Fix This First
${lastImprove || 'No critical flags yet.'}

### What Has Worked Well (keep doing this)
${worked || 'No data yet.'}

### What To Improve
${improve || 'No data yet.'}

### Phrases / Patterns To NEVER Use Again
${avoidPhrases || 'No data yet.'}

### Moves To Use MORE
${usePhrases || 'No data yet.'}

CRITICAL: Address every item in "MOST CRITICAL" first. These are Colin's highest-priority corrections. Apply every lesson above. Goal: indistinguishable from his actual byline.
`.trim();
}
