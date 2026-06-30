import { readFileSync, existsSync } from 'fs';

// Load .env.local manually
if (existsSync('.env.local')) {
  const env = readFileSync('.env.local', 'utf-8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

import { scoreText, scoreTextWithPerplexity } from '../lib/score';
import { postProcess } from '../lib/post-process';

const userSample = `# Malaysian Ingredients You're Probably Using Wrong

For a lot of us who cook at home, there's comfort in knowing what goes where. Belacan in sambal. Lemongrass in tom yam. Pandan in kuih. We've spent years watching our mothers and grandmothers work these ingredients into meals, and somewhere along the way, we picked up the patterns. But some of those patterns might not be doing the ingredient justice. Not because anyone taught us wrong, but because we've stopped questioning why we do it that way in the first place.

The principle is simple enough. An ingredient is only as good as how you use it. Most of the time, we're working off muscle memory rather than curiosity. So here are three Malaysian staples that deserve a second look (not because you're doing it catastrophically wrong, but because there's a better version sitting right there if you know where to look). You toss it into sambal and stir it into curries. Fine. But you're probably adding it too early. The thing about belacan is that its flavour compounds are volatile. They evaporate when exposed to prolonged heat. Toast it over a flame until it darkens and smells aggressively funky, then crumble it in at the very end of your cooking, just before you pull the pot off the stove. What you get is a sharper, more present umami punch instead of a vague background hum. It's the difference between tasting belacan and tasting something that once had belacan in it.

Store it in the freezer if you're not using it often. Keeps the potency intact. Stops it from perfuming your entire pantry. They get bruised and thrown into curries whole, which works if you're going for a gentle background note. But if you want the citrus oil to actually assert itself, roll the leaves tightly and slice them as finely as you can manage, then add them in the last two minutes of cooking. The oils sit on the surface of the leaf, so the more you cut, the more you release. Small adjustment. But it turns the flavour from a whisper into something you can actually point to on your tongue.

And if you're making a salad (kerabu, yam, anything raw) this is the only way to do it. Whole leaves in a cold dish just sit there looking decorative. Tamarind paste from a jar is convenient, which is probably why most of us reach for it without thinking twice. But if you've ever made tamarind water from the pulp block, you'll know the difference immediately. The block gives you control over concentration. Tastes cleaner too. Less metallic, more sour in a way that feels bright rather than aggressive.

Soak a walnut-sized piece in warm water for ten minutes, work it with your fingers until it loosens, then strain out the seeds and fibres. What's left is tamarind water that actually tastes like tamarind, not like something that's been sitting in a plastic tub for six months. Takes an extra five minutes. Five minutes that show up in the final dish.

You haven't been ruining your food. But there's a version of these ingredients that does more, that tastes sharper, brighter, more like the thing itself, and it doesn't require any special skill or equipment. Just a small shift in timing or technique.

Hold the belacan back until the end. Slice your lime leaves thin. Soak your tamarind. See if it changes anything.

It probably will.`;

async function main() {
  console.log('=== HEURISTIC ONLY (raw) ===');
  const heur = scoreText(userSample);
  console.log(`Score: ${heur.score}/100 (${heur.label})`);
  console.log('Reasons:', heur.reasons);

  console.log('\n=== HEURISTIC ONLY (post-processed) ===');
  const processed = postProcess(userSample);
  const heur2 = scoreText(processed);
  console.log(`Score: ${heur2.score}/100 (${heur2.label})`);
  console.log('Reasons:', heur2.reasons);

  console.log('\n=== HEURISTIC + PERPLEXITY (raw) ===');
  const full = await scoreTextWithPerplexity(userSample);
  console.log(`Score: ${full.score}/100 (${full.label})`);
  console.log(`Perplexity: ${full.breakdown.perplexity?.toFixed(2) ?? 'N/A'}`);
  console.log('Reasons:', full.reasons);

  console.log('\n=== HEURISTIC + PERPLEXITY (post-processed) ===');
  const full2 = await scoreTextWithPerplexity(processed);
  console.log(`Score: ${full2.score}/100 (${full2.label})`);
  console.log(`Perplexity: ${full2.breakdown.perplexity?.toFixed(2) ?? 'N/A'}`);
  console.log('Reasons:', full2.reasons);
}

main().catch(console.error);
