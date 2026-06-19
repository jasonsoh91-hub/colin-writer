import * as fs from 'fs';
import * as path from 'path';

export interface FeedbackEntry {
  id: string;
  topic: string;
  timestamp: number;
  article: string;
  rating: number; // 1-10
  what_worked: string;
  what_to_improve: string;
  phrases_to_avoid: string;
  phrases_to_use_more: string;
}

const FEEDBACK_DIR = path.join(process.cwd(), 'data', 'feedback');

export function saveFeedback(entry: FeedbackEntry): void {
  fs.mkdirSync(FEEDBACK_DIR, { recursive: true });
  const filepath = path.join(FEEDBACK_DIR, `${entry.id}.json`);
  fs.writeFileSync(filepath, JSON.stringify(entry, null, 2));
}

export function loadAllFeedback(): FeedbackEntry[] {
  if (!fs.existsSync(FEEDBACK_DIR)) return [];
  return fs.readdirSync(FEEDBACK_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(FEEDBACK_DIR, f), 'utf-8')))
    .sort((a, b) => a.timestamp - b.timestamp);
}

export function buildFeedbackPrompt(): string {
  const entries = loadAllFeedback();
  if (entries.length === 0) return '';

  const avgRating = (entries.reduce((s, e) => s + e.rating, 0) / entries.length).toFixed(1);

  const worked = entries
    .filter(e => e.what_worked.trim())
    .map(e => `- ${e.what_worked.trim()}`)
    .join('\n');

  const improve = entries
    .filter(e => e.what_to_improve.trim())
    .map(e => `- ${e.what_to_improve.trim()}`)
    .join('\n');

  const avoidPhrases = entries
    .filter(e => e.phrases_to_avoid.trim())
    .map(e => `- ${e.phrases_to_avoid.trim()}`)
    .join('\n');

  const usePhrases = entries
    .filter(e => e.phrases_to_use_more.trim())
    .map(e => `- ${e.phrases_to_use_more.trim()}`)
    .join('\n');

  return `
## Feedback Loop — Lessons From ${entries.length} Past Review(s) (avg score: ${avgRating}/10)

### What Has Worked Well (keep doing this)
${worked || 'No data yet.'}

### What To Improve (Colin flagged these)
${improve || 'No data yet.'}

### Phrases / Patterns To AVOID
${avoidPhrases || 'No data yet.'}

### Phrases / Patterns To Use MORE
${usePhrases || 'No data yet.'}

IMPORTANT: Study the above lessons carefully. Apply every correction. The goal is to make this article indistinguishable from Colin's actual published work.
`.trim();
}
