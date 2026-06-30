import { readFileSync, existsSync } from 'fs';
if (existsSync('.env.local')) {
  const env = readFileSync('.env.local', 'utf-8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

import { scoreText, scoreTextWithPerplexity } from '../lib/score';
import { postProcess } from '../lib/post-process';

const sample = `# Malaysian Ingredients You're Probably Using Wrong

You've been cooking with these for years. But are you actually using them right?

This isn't about gatekeeping. Or claiming there's only one correct method. It's simpler than that. Most Malaysian ingredients were designed to do specific jobs. When you work against them, you don't just lose flavour. You lose the whole point. Sits in most kitchens. Small block, wrapped in paper, shoved to the back of the fridge. The problem? Most people treat it like a finishing seasoning — something you toss in at the end to bump up the umami.

That's not what belacan does.

Belacan needs heat. Serious, sustained heat. Toast it first — over an open flame or in a dry pan — until it darkens and the smell shifts from fishy to roasted, almost sweet. Then you pound it into your sambal or stir it into your curry base. Add it raw and you'll get a one-dimensional funk instead of the layered, savoury depth it's supposed to deliver. There's a reason the smell of toasting belacan is so distinct. It's the ingredient transforming into what it was always meant to be. Get treated like garnish. Something you toss into a curry because the recipe says so, then fish out before serving like bay leaves.

But kaffir lime leaves aren't passive. They're meant to perfume. And the way you release that perfume is by bruising them — tearing the leaves slightly or crushing them in your hand before adding them to the pot. Drop whole, intact leaves into your tom yum or rendang and you're wasting them. The oils that carry that sharp, citrusy, floral aroma are locked inside the leaf's structure. They need to be broken open.

So next time you're cooking, slow down for a second. Toast the belacan. Bruise the kaffir lime leaves. Blend the pandan.

Won't take much longer. But it'll make all the difference.`;

async function main() {
  console.log('=== INPUT (93% GPTZero) ===');
  const h = scoreText(sample);
  console.log(`Heuristic: ${h.score}/100 (${h.label})`);
  console.log('Reasons:', h.reasons);
  console.log('Key metrics:');
  console.log(`  emDashCount: ${h.breakdown.emDashCount}`);
  console.log(`  ctaCloserImperatives: ${h.breakdown.ctaCloserImperatives}`);
  console.log(`  rhetoricalQuestions: ${h.breakdown.rhetoricalQuestions}`);
  console.log(`  subjectDropFragments: ${h.breakdown.subjectDropFragments}`);
  console.log(`  emphaticSingleSentenceParas: ${h.breakdown.emphaticSingleSentenceParas}`);

  console.log('\n=== AFTER POST-PROCESS ===');
  const processed = postProcess(sample);
  const ph = scoreText(processed);
  console.log(`Heuristic: ${ph.score}/100 (${ph.label})`);
  console.log('Reasons:', ph.reasons);
  console.log('Key metrics:');
  console.log(`  emDashCount: ${ph.breakdown.emDashCount}`);
  console.log(`  ctaCloserImperatives: ${ph.breakdown.ctaCloserImperatives}`);
  console.log(`  rhetoricalQuestions: ${ph.breakdown.rhetoricalQuestions}`);
  console.log(`  subjectDropFragments: ${ph.breakdown.subjectDropFragments}`);
  console.log(`  emphaticSingleSentenceParas: ${ph.breakdown.emphaticSingleSentenceParas}`);

  const full = await scoreTextWithPerplexity(sample);
  console.log(`\n=== COMBINED ON RAW: ${full.score}/100 (${full.label}), AI prob: ${((full.breakdown.perplexity ?? 0) * 100).toFixed(1)}% ===`);

  console.log('\n=== POST-PROCESSED OUTPUT (first 1500 chars) ===');
  console.log(processed.slice(0, 1500));
}
main().catch(console.error);
