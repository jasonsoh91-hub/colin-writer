import { readFileSync, existsSync } from 'fs';
if (existsSync('.env.local')) {
  const env = readFileSync('.env.local', 'utf-8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

import { llamaHumanize } from '../lib/llama-pass';
import { postProcess } from '../lib/post-process';
import { scoreTextWithPerplexity } from '../lib/score';

const userSample = `For a lot of us who cook at home, there's comfort in knowing what goes where. Belacan in sambal. Lemongrass in tom yam. Pandan in kuih. We've spent years watching our mothers and grandmothers work these ingredients into meals, and somewhere along the way, we picked up the patterns. But some of those patterns might not be doing the ingredient justice. Not because anyone taught us wrong, but because we've stopped questioning why we do it that way in the first place.

The principle is simple enough. An ingredient is only as good as how you use it. Most of the time, we're working off muscle memory rather than curiosity. So here are three Malaysian staples that deserve a second look.`;

async function main() {
  console.log('=== INPUT ===');
  const before = await scoreTextWithPerplexity(userSample);
  console.log(`Score: ${before.score}/100 (${before.label}), AI prob: ${((before.breakdown.perplexity ?? 0) * 100).toFixed(1)}%`);

  console.log('\n=== CALLING LLAMA 3.3 70B FREE ===');
  const out = await llamaHumanize(userSample);
  if (!out) { console.error('Llama failed'); return; }

  const processed = postProcess(out);
  const after = await scoreTextWithPerplexity(processed);
  console.log(`Score: ${after.score}/100 (${after.label}), AI prob: ${((after.breakdown.perplexity ?? 0) * 100).toFixed(1)}%`);
  console.log('Reasons:', after.reasons);

  console.log('\n=== LLAMA OUTPUT (first 1200 chars) ===');
  console.log(processed.slice(0, 1200));
}
main().catch(console.error);
