import { scoreText } from '../lib/score';
import { postProcess } from '../lib/post-process';

const userSample = `# Malaysian Ingredients You're Probably Using Wrong

For a lot of us who grew up eating Malaysian food, there's a certain confidence that comes with familiarity. We've watched our mothers and grandmothers work these ingredients into meals for years, and somewhere along the way, we absorbed what we thought was the right approach. But confidence isn't the same as accuracy, and it turns out a lot of what we've been doing—myself included—doesn't quite honour what these ingredients are capable of.

The principle here isn't about following some rigid culinary rulebook. It's about understanding what each ingredient is actually designed to do, and then letting it do that. Most of the time, we're either asking too much of it, or not nearly enough.

Belacan sits in a lot of kitchens as a background player, something you toast quickly and toss into sambal or a curry base without much thought. But if you're treating it like a one-note umami bomb, you're missing the point entirely. The toasting matters more than you think—too little and it stays raw and fishy, too much and it turns bitter and acrid. What you're after is that moment when the smell shifts from aggressive to almost sweet, when the funk mellows into something closer to caramel. And once it's there, it doesn't need to be ground into oblivion. A coarse texture gives you pockets of intensity rather than a uniform saltiness that flattens everything else in the dish. If you've been adding it straight from the packet without toasting, or blending it into a fine paste every single time, you've been robbing yourself of what makes it interesting.

Pandan leaves aren't just for colour, though you'd be forgiven for thinking so given how often they're treated like edible food dye. The fragrance is the whole point, but you don't get much of it by tossing a couple of leaves into a pot and hoping for the best. You need to bruise them—tie them into knots, crush them slightly, do something to break down the fibres so the oils can actually escape. And then you need to leave them in long enough for the infusion to happen, which is longer than most people think. Five minutes won't do it. Fifteen might. The other thing people get wrong is assuming pandan works the same way in everything. In something delicate like pandan chiffon cake, you want the extract or a blended paste so the flavour is clean and consistent. In coconut rice or a curry, you want the whole leaves doing their thing slowly. It's not a one-size-fits-all ingredient, but we keep treating it like one.

Kaffir lime leaves get added to Tom Yum or rendang as if they're a garnish, something you chuck in at the end for a vague citrus note. But that's not how they work best. The flavour is in the oils, and those oils need heat and time to properly release. If you're adding them in the last two minutes of cooking, you're getting maybe 20 percent of what they can give you. What you should be doing is bruising them first—rip them slightly, or fold and press them between your fingers until you can smell the lime—and then add them early, when the aromatics are going in. Let them simmer. Let them infuse. And if you're using them in a paste or a spice blend, slice them as finely as you can manage, because those thick ribs don't break down and they don't taste good. I've bitten into enough whole leaves in curries to know this for certain.

I'm not claiming this will fix every dish you make, or that you've been doing it catastrophically wrong up until now. But these are small adjustments that make a noticeable difference, and they're worth knowing about if you're going to keep these ingredients around.

The next time you toast belacan, pay attention to the smell. That's the only real indicator you have, and it's more reliable than any timer. When it shifts from something you'd rather not be standing near to something that almost makes you hungry, that's when you pull it off the heat.`;

console.log('=== RAW INPUT ===');
const raw = scoreText(userSample);
console.log(`Score: ${raw.score}/100 (${raw.label})`);
console.log('Breakdown:', raw.breakdown);
console.log('Reasons:', raw.reasons);

console.log('\n=== AFTER POST-PROCESS ===');
const processed = postProcess(userSample);
const proc = scoreText(processed);
console.log(`Score: ${proc.score}/100 (${proc.label})`);
console.log('Breakdown:', proc.breakdown);
console.log('Reasons:', proc.reasons);

console.log('\n=== PROCESSED TEXT (first 800 chars) ===');
console.log(processed.slice(0, 800));
