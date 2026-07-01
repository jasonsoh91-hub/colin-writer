// Build a standalone HTML presentation: 5-round Turing test.
// Each round shows 3 articles (A/B/C). Rounds 1-4: 1 real Colin + 2 AI.
// Round 5: all 3 AI (trick round).
//
// Text is normalised so quote style + magazine captions don't leak the answer.
// Output: presentations/turing-test.html (single file, no dependencies).

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import * as path from 'path';

// ── Load articles ────────────────────────────────────────────────────────────
function cleanRealText(t: string): string {
  const i = t.indexOf('Share ');
  if (i !== -1) t = t.slice(i + 6);
  const j = t.indexOf('TrendingLatest');
  if (j !== -1) t = t.slice(0, j);
  const k = t.indexOf('Previous Post');
  if (k !== -1) t = t.slice(0, k);
  return t.trim();
}

function normalise(text: string): string {
  return text
    // Strip magazine photo captions — visual giveaway that this is a real palateasia piece
    .replace(/Photography:\s*[^|\n]+\|\s*[^\n.]+/g, '')
    .replace(/Opening image:\s*[^\n.]+/g, '')
    // Strip leading markdown title/bold that might've slipped past colin-strip on older gens
    .replace(/^\s*#+\s.+\n+/, '')
    .replace(/^\s*\*\*[^*]+\*\*\s*\n+/, '')
    // Normalise quotes — real Colin uses curly (‘’“”), AI uses straight ('") — obvious tell
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    // Trim ambient whitespace
    .split(/\n+/).map(l => l.trim()).filter(Boolean).join('\n\n')
    .trim();
}

function loadReal(slug: string): { title: string; body: string } {
  const j = JSON.parse(readFileSync(`./data/articles_v3/colin-${slug}.json`, 'utf-8'));
  return { title: j.title, body: normalise(cleanRealText(j.full_text)) };
}

function loadAI(relPath: string): string {
  return normalise(readFileSync(`./data/iteration-runs/${relPath}`, 'utf-8'));
}

const REAL = {
  butter: loadReal('all-about-butter'),
  capsaicin: loadReal('how-capsaicin-works'),
  kitchen: loadReal('kitchen-tools-you-need'),
  coffee: loadReal('coffee-species-guide-arabica-and-robusta'),
};

const AI = {
  oliveOil: loadAI('iter-3/olive-oil.md'),
  vinegar: loadAI('next-5/vinegar.md'),
  umami: loadAI('iter-3/umami.md'),
  instantCoffee: loadAI('next-5/instant-coffee.md'),
  pantryStaples: loadAI('iter-3/pantry-staples.md'),
  sauces: loadAI('next-5/sauces.md'),
  salt: loadAI('turing-test/salt.md'),
  chocolate: loadAI('turing-test/chocolate.md'),
  sourdough: loadAI('next-5/sourdough.md'),
  craftBeer: loadAI('next-5/craft-beer.md'),
  fermentation: loadAI('turing-test/fermentation.md'),
};

// ── Round definitions ────────────────────────────────────────────────────────
// answerIdx is 0-based index into `articles` array — the real Colin. -1 = all AI.

interface Round {
  n: number;
  category: string;
  articles: { label: string; body: string; source: string; realTitle?: string; note?: string }[];
  answerIdx: number; // -1 means round 5 trick round
  explainer: string;
}

const ROUNDS: Round[] = [
  {
    n: 1,
    category: 'Ingredient Deep-Dive',
    articles: [
      { label: 'A', body: AI.oliveOil, source: 'AI — "All About Olive Oil" (iter-3, score 97)', note: 'Trained on butter/coffee-guide corpus.' },
      { label: 'B', body: REAL.butter.body, source: `REAL — Colin Gomez · "${REAL.butter.title}" · palateasia.com`, realTitle: REAL.butter.title },
      { label: 'C', body: AI.vinegar, source: 'AI — "All About Vinegar" (next-5, score 95)', note: 'Fresh gen after full pipeline refinement.' },
    ],
    answerIdx: 1,
    explainer: 'Butter is real Colin. Tell: "as a (hopefully) habitual consumer of my articles" — the mid-word parenthetical wink is a Colin signature the AI approximates but rarely nails.',
  },
  {
    n: 2,
    category: 'Debunking Science',
    articles: [
      { label: 'A', body: AI.umami, source: 'AI — "How Umami Actually Works" (iter-3, score 100)' },
      { label: 'B', body: AI.instantCoffee, source: 'AI — "The Truth About Instant Coffee" (next-5, score 90)' },
      { label: 'C', body: REAL.capsaicin.body, source: `REAL — Colin Gomez · "${REAL.capsaicin.title}"`, realTitle: REAL.capsaicin.title },
    ],
    answerIdx: 2,
    explainer: 'Capsaicin is real Colin. Tell: opens "Have you ever wondered what makes your food spicy?" — the AI now knows this is an allowed Colin opener but the follow-through ("through a most fascinating mechanism of action, essentially hijacks this system") is subtly less playful than Colin\'s own escalation.',
  },
  {
    n: 3,
    category: 'Lifestyle Guide (3 items)',
    articles: [
      { label: 'A', body: REAL.kitchen.body, source: `REAL — Colin Gomez · "${REAL.kitchen.title}"`, realTitle: REAL.kitchen.title },
      { label: 'B', body: AI.sauces, source: 'AI — "3 Sauces You Should Always Have" (next-5, score 92)' },
      { label: 'C', body: AI.pantryStaples, source: 'AI — "Pantry Staples" (iter-3, score 92)' },
    ],
    answerIdx: 0,
    explainer: 'Kitchen Tools is real Colin. Structural giveaway: the item-header format ("Danish dough whisk" on its own line) was the model we taught the AI. Both AI pieces reproduce it faithfully. Real tell here is denser wit — "requiring enough effort that your forearm starts cursing you out halfway through".',
  },
  {
    n: 4,
    category: 'Ingredient Comparison',
    articles: [
      { label: 'A', body: AI.salt, source: 'AI — "All About Salt" (turing-test gen, score 95)' },
      { label: 'B', body: AI.chocolate, source: 'AI — "All About Chocolate" (turing-test gen, score 92)' },
      { label: 'C', body: REAL.coffee.body, source: `REAL — Colin Gomez · "${REAL.coffee.title}"`, realTitle: REAL.coffee.title },
    ],
    answerIdx: 2,
    explainer: 'Coffee Species Guide is real Colin. Tell: specific historical anchor ("The Coffea genus splits into over 120 species, though only a handful matter commercially") delivered with dry throwaway. AI versions still tend toward slightly cleaner exposition.',
  },
  {
    n: 5,
    category: 'Debunking Science',
    articles: [
      { label: 'A', body: AI.sourdough, source: 'AI — "How Sourdough Actually Rises" (next-5, score 84)' },
      { label: 'B', body: AI.fermentation, source: 'AI — "How Fermentation Actually Works" (turing-test, score 87)' },
      { label: 'C', body: AI.craftBeer, source: 'AI — "Malaysian Craft Beer" (next-5, score 80)' },
    ],
    answerIdx: -1,
    explainer: 'All three were AI. There was no real Colin in this round. The pipeline produced these on the same run — the "worst" (craft-beer at 80) and the "best" (fermentation at 87) both read as plausibly human on a first pass. This is where voice fidelity is right now: even the low-scoring generations survive casual scrutiny.',
  },
];

// ── HTML template ────────────────────────────────────────────────────────────
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderRound(r: Round): string {
  return `
<section class="round" data-round="${r.n}" data-answer="${r.answerIdx}" hidden>
  <div class="round-header">
    <div class="round-meta">
      <span class="pill">Round ${r.n} of 5</span>
      <span class="category">${esc(r.category)}</span>
    </div>
    <div class="score">Score: <span class="score-value">0</span> / 5</div>
  </div>

  <div class="articles">
    ${r.articles.map((a, i) => `
      <article class="card" data-idx="${i}">
        <header class="card-header">
          <span class="letter">${a.label}</span>
          <span class="hint">Read carefully. Look for Colin's voice fingerprint.</span>
        </header>
        <div class="card-body">${esc(a.body).split(/\n\n+/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')}</div>
        <footer class="card-reveal" hidden>
          <div class="source">${esc(a.source)}</div>
          ${a.note ? `<div class="note">${esc(a.note)}</div>` : ''}
        </footer>
      </article>
    `).join('')}
  </div>

  <div class="prompt">
    <div class="q">Which article was written by the real Colin Gomez?</div>
    <div class="options">
      ${r.articles.map((_, i) => `<button class="opt" data-pick="${i}">${r.articles[i].label} is Real</button>`).join('')}
    </div>
  </div>

  <div class="reveal" hidden>
    <div class="verdict"></div>
    <div class="explainer">${esc(r.explainer)}</div>
    <button class="next-btn">${r.n === 5 ? 'See Final Score' : 'Next Round'}</button>
  </div>
</section>
`;
}

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Real Colin vs AI Colin — 5-Round Test</title>
<style>
  :root {
    --bg: #0a0a0a;
    --panel: #0d0d0d;
    --border: #2a2a2a;
    --gold: #c8a84b;
    --text: #e8e8e8;
    --muted: #888;
    --dim: #555;
    --green: #4ade80;
    --red: #f87171;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Georgia, serif; }
  body { min-height: 100vh; padding: 24px; }
  .container { max-width: 1400px; margin: 0 auto; }

  /* Landing / intro */
  section.slide { display: none; }
  section.slide.active { display: block; }

  .landing {
    min-height: 80vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    gap: 24px;
  }
  .landing .brand {
    font-size: 12px;
    letter-spacing: 4px;
    text-transform: uppercase;
    color: var(--gold);
  }
  .landing h1 {
    font-size: clamp(36px, 6vw, 72px);
    margin: 0;
    font-weight: 600;
    letter-spacing: -0.02em;
    background: linear-gradient(135deg, #fff 0%, var(--gold) 100%);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .landing .sub {
    font-size: 18px;
    color: var(--muted);
    max-width: 720px;
    line-height: 1.5;
  }
  .cta {
    background: var(--gold);
    color: #000;
    border: 0;
    padding: 14px 32px;
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0.5px;
    border-radius: 999px;
    cursor: pointer;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .cta:hover { transform: translateY(-1px); box-shadow: 0 6px 24px rgba(200, 168, 75, 0.25); }
  .cta:active { transform: translateY(0); }

  .rules {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 32px;
    max-width: 720px;
    text-align: left;
    line-height: 1.7;
    font-size: 15px;
    color: var(--text);
  }
  .rules h3 { margin-top: 0; color: var(--gold); font-size: 14px; letter-spacing: 2px; text-transform: uppercase; }
  .rules ol { padding-left: 20px; }
  .rules li { margin-bottom: 10px; }
  .rules em { color: var(--gold); font-style: normal; font-weight: 600; }

  /* Round */
  .round-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }
  .round-meta { display: flex; gap: 12px; align-items: center; }
  .pill {
    display: inline-block;
    background: rgba(200, 168, 75, 0.1);
    border: 1px solid rgba(200, 168, 75, 0.4);
    color: var(--gold);
    padding: 4px 12px;
    border-radius: 999px;
    font-size: 11px;
    letter-spacing: 2px;
    text-transform: uppercase;
    font-weight: 600;
  }
  .category { font-size: 14px; color: var(--muted); }
  .score { color: var(--muted); font-size: 13px; }
  .score-value { color: var(--gold); font-weight: 600; font-size: 16px; }

  .articles {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 24px;
  }
  @media (max-width: 900px) {
    .articles { grid-template-columns: 1fr; }
  }

  .card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    max-height: 65vh;
  }
  .card.correct { border-color: var(--green); box-shadow: 0 0 0 1px var(--green), 0 8px 40px rgba(74, 222, 128, 0.15); }
  .card.wrong { border-color: var(--red); box-shadow: 0 0 0 1px var(--red); opacity: 0.85; }

  .card-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--border);
    background: rgba(255, 255, 255, 0.02);
  }
  .letter {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: rgba(200, 168, 75, 0.15);
    color: var(--gold);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 14px;
    letter-spacing: 0.5px;
  }
  .hint { font-size: 11px; color: var(--dim); }

  .card-body {
    padding: 20px;
    overflow-y: auto;
    line-height: 1.7;
    font-size: 14.5px;
    color: #ddd;
    font-family: Georgia, 'Times New Roman', serif;
  }
  .card-body p { margin: 0 0 14px 0; }
  .card-body::-webkit-scrollbar { width: 8px; }
  .card-body::-webkit-scrollbar-track { background: transparent; }
  .card-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }

  .card-reveal {
    padding: 14px 18px;
    border-top: 1px solid var(--border);
    background: rgba(255, 255, 255, 0.03);
    font-size: 12px;
  }
  .source { color: var(--gold); font-weight: 600; }
  .note { color: var(--muted); margin-top: 4px; }

  .prompt {
    text-align: center;
    padding: 24px 0;
  }
  .q {
    font-size: 20px;
    color: var(--text);
    margin-bottom: 16px;
    font-weight: 500;
  }
  .options { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
  .opt {
    background: transparent;
    color: var(--text);
    border: 1px solid var(--border);
    padding: 12px 24px;
    font-size: 14px;
    border-radius: 999px;
    cursor: pointer;
    transition: all 0.15s ease;
    letter-spacing: 0.3px;
  }
  .opt:hover:not(:disabled) { border-color: var(--gold); color: var(--gold); }
  .opt:disabled { opacity: 0.5; cursor: default; }
  .opt.picked { border-color: var(--gold); background: rgba(200, 168, 75, 0.1); color: var(--gold); }
  .opt-trick { border-style: dashed; }

  .reveal {
    margin-top: 20px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-left: 3px solid var(--gold);
    border-radius: 12px;
    padding: 20px 24px;
  }
  .verdict {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 8px;
  }
  .verdict.win { color: var(--green); }
  .verdict.loss { color: var(--red); }
  .explainer { color: var(--muted); font-size: 14px; line-height: 1.6; margin-bottom: 18px; }
  .next-btn {
    background: var(--gold);
    color: #000;
    border: 0;
    padding: 10px 24px;
    font-size: 14px;
    font-weight: 600;
    border-radius: 999px;
    cursor: pointer;
  }
  .next-btn:hover { opacity: 0.9; }

  /* Final */
  .final {
    text-align: center;
    padding: 60px 20px;
  }
  .final .big {
    font-size: 80px;
    font-weight: 700;
    color: var(--gold);
    line-height: 1;
    margin: 20px 0;
  }
  .final h2 { font-size: 32px; margin: 0 0 12px; }
  .final .verdict-copy { color: var(--muted); max-width: 600px; margin: 20px auto; line-height: 1.6; font-size: 15px; }
  .breakdown {
    max-width: 720px;
    margin: 40px auto 0;
    text-align: left;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 24px;
  }
  .breakdown h4 { color: var(--gold); margin: 0 0 16px; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; }
  .breakdown-row {
    display: flex;
    justify-content: space-between;
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
    font-size: 14px;
  }
  .breakdown-row:last-child { border-bottom: 0; }
  .breakdown-row .rk { color: var(--muted); }
  .breakdown-row .rv { color: var(--text); font-weight: 500; }
  .breakdown-row .rv.win { color: var(--green); }
  .breakdown-row .rv.loss { color: var(--red); }

  .restart {
    margin-top: 32px;
    background: transparent;
    color: var(--muted);
    border: 1px solid var(--border);
    padding: 10px 24px;
    font-size: 13px;
    border-radius: 999px;
    cursor: pointer;
  }
  .restart:hover { border-color: var(--gold); color: var(--gold); }

  /* Loop diagram */
  .loop {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    align-items: stretch;
    gap: 0;
    margin: 24px 0 8px;
    position: relative;
  }
  @media (max-width: 900px) { .loop { grid-template-columns: 1fr; } }
  .loop-step {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 18px 14px;
    text-align: center;
    position: relative;
    margin: 0 6px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-height: 148px;
  }
  .loop-step .num {
    width: 26px; height: 26px; border-radius: 50%;
    background: rgba(200,168,75,0.15);
    color: var(--gold);
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700;
    margin: 0 auto 10px;
  }
  .loop-step .name {
    font-size: 11px; letter-spacing: 2.5px; text-transform: uppercase;
    color: var(--gold); font-weight: 600; margin-bottom: 6px;
  }
  .loop-step .caption { font-size: 12px; color: var(--muted); margin-bottom: 12px; line-height: 1.4; }
  .loop-step .stat {
    font-size: 26px; font-weight: 700; color: #fff; line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .loop-step .stat-lbl { font-size: 10px; color: var(--dim); letter-spacing: 1.5px; text-transform: uppercase; margin-top: 4px; }
  .loop-arrow {
    display: flex; align-items: center; justify-content: center;
    color: var(--gold); font-size: 20px; opacity: 0.6;
    position: absolute; top: 50%; transform: translateY(-50%);
    pointer-events: none;
  }
  @media (max-width: 900px) { .loop-arrow { display: none; } }
  .loop-return {
    text-align: center; margin-top: 12px;
    color: var(--dim); font-size: 11px; letter-spacing: 2px; text-transform: uppercase;
  }
  .loop-return::before {
    content: '↑ Regenerates with every review — the loop compounds ↑';
    display: block;
    color: var(--gold); opacity: 0.75;
    font-style: normal;
  }
  .how-wrap {
    max-width: 1100px; margin: 0 auto; text-align: center;
    padding: 20px 0;
  }
  .how-wrap h2 {
    font-size: clamp(28px, 4vw, 44px); margin: 20px 0 8px;
    font-weight: 600; letter-spacing: -0.01em;
    background: linear-gradient(135deg, #fff 0%, var(--gold) 100%);
    -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
  }
  .how-wrap .sub {
    font-size: 16px; color: var(--muted); max-width: 700px; margin: 0 auto 30px; line-height: 1.6;
  }
  .how-wrap .footnote {
    color: var(--dim); font-size: 12px; margin-top: 24px; line-height: 1.6;
    max-width: 720px; margin-left: auto; margin-right: auto;
  }
</style>
</head>
<body>
<div class="container">

<!-- LANDING -->
<section class="slide active" id="landing">
  <div class="landing">
    <div class="brand">Colin Writer · Voice Fidelity Demo</div>
    <h1>Real Colin<br>vs<br>AI Colin</h1>
    <div class="sub">Five rounds. Three articles per round. Your job: pick the one written by the real Colin Gomez.</div>
    <button class="cta" onclick="showSlide('intro')">Start</button>
  </div>
</section>

<!-- INTRO / RULES -->
<section class="slide" id="intro">
  <div class="landing">
    <div class="brand">The Rules</div>
    <div class="rules">
      <h3>How this works</h3>
      <ol>
        <li>Each round shows <em>three articles</em>: A, B, and C.</li>
        <li><em>One is written by Colin Gomez</em>. The other two are written by the AI writer trained on his voice.</li>
        <li>Titles are hidden. Layout and punctuation are normalised — no visual giveaways.</li>
        <li>Read all three. Pick the one you believe is the real Colin.</li>
        <li>The correct answer is revealed after each round. Score is tracked to the end.</li>
      </ol>
    </div>
    <button class="cta" onclick="showSlide('how-it-works'); loadStats();">Next</button>
  </div>
</section>

<!-- HOW IT WORKS / LIVE LOOP -->
<section class="slide" id="how-it-works">
  <div class="how-wrap">
    <div class="brand" style="color: var(--gold); font-size: 12px; letter-spacing: 4px; text-transform: uppercase;">How the AI Learns</div>
    <h2>A closed feedback loop</h2>
    <div class="sub">The AI Colin you're about to test isn't a static model. Every article it writes is scored, every human review it receives is fed back into the next generation's prompt. Numbers below are live.</div>

    <div class="loop">
      <div class="loop-step">
        <div class="num">1</div>
        <div class="name">Write</div>
        <div class="caption">AI generates on topic + genre</div>
        <div><div class="stat" id="stat-write">—</div><div class="stat-lbl">articles</div></div>
      </div>
      <div class="loop-step">
        <div class="num">2</div>
        <div class="name">Track</div>
        <div class="caption">Score + body persist to Supabase</div>
        <div><div class="stat" id="stat-track">—</div><div class="stat-lbl">logged</div></div>
      </div>
      <div class="loop-step">
        <div class="num">3</div>
        <div class="name">Review</div>
        <div class="caption">Human rates + critiques</div>
        <div><div class="stat" id="stat-review">—</div><div class="stat-lbl">reviews</div></div>
      </div>
      <div class="loop-step">
        <div class="num">4</div>
        <div class="name">Learn</div>
        <div class="caption">Last 8 reviews injected into system prompt</div>
        <div><div class="stat" id="stat-learn">—</div><div class="stat-lbl">in loop</div></div>
      </div>
      <div class="loop-step">
        <div class="num">5</div>
        <div class="name">Apply</div>
        <div class="caption">Model addresses critiques on next gen</div>
        <div><div class="stat" id="stat-apply">—</div><div class="stat-lbl">avg similarity</div></div>
      </div>
    </div>
    <div class="loop-return"></div>

    <div class="footnote">Current fidelity numbers you're seeing reflect the state of the loop at page load. The AI you're testing has passed through this cycle for every article it's ever written.</div>

    <button class="cta" style="margin-top: 32px;" onclick="startTest()">Begin Round 1</button>
  </div>
</section>

<!-- ROUNDS -->
${ROUNDS.map(renderRound).join('\n')}

<!-- FINAL -->
<section class="slide" id="final">
  <div class="final">
    <div class="brand">Final Result</div>
    <h2>You scored</h2>
    <div class="big"><span id="final-score">0</span> / 5</div>
    <div class="verdict-copy" id="final-verdict"></div>
    <div class="breakdown">
      <h4>Round-by-round</h4>
      <div id="breakdown"></div>
    </div>
    <button class="restart" onclick="location.reload()">Run the test again</button>
  </div>
</section>

</div>

<script>
const rounds = document.querySelectorAll('section.round');
let currentRound = 0;
let score = 0;
const picks = []; // { round, picked, answer, correct }

function showSlide(id) {
  document.querySelectorAll('section.slide').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'instant' });
}

async function loadStats() {
  try {
    const res = await fetch('/api/training-stats?persona=colin&limit=500', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const total = data.stats?.totalRuns ?? 0;
    const avg = data.stats?.rollingAvgLast10 ?? '—';
    const reviews = data.stats?.recent ? data.stats.recent.length : 0;
    // Feedback count isn't in the endpoint — approximate from stats OR hit a separate call.
    // For now use rolling avg + total as the two live numbers we can show.
    const el = (id, val) => { const n = document.getElementById(id); if (n) n.textContent = String(val); };
    el('stat-write', total);
    el('stat-track', total);
    el('stat-review', '•');  // will be replaced below if endpoint returns it
    el('stat-learn', 'last 8');
    el('stat-apply', avg === '—' ? '—' : avg + '%');
    // Try secondary fetch for feedback count
    try {
      const fb = await fetch('/api/feedback-count', { cache: 'no-store' });
      if (fb.ok) {
        const { count } = await fb.json();
        el('stat-review', count);
      } else {
        el('stat-review', '—');
      }
    } catch { el('stat-review', '—'); }
  } catch (e) {
    console.warn('stats load failed', e);
    ['stat-write','stat-track','stat-review','stat-apply'].forEach(id => {
      const n = document.getElementById(id); if (n) n.textContent = '—';
    });
  }
}

function startTest() {
  document.querySelectorAll('section.slide').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('section.round').forEach(s => s.hidden = true);
  currentRound = 0;
  score = 0;
  picks.length = 0;
  showRound(0);
}

function showRound(i) {
  rounds.forEach(r => r.hidden = true);
  const r = rounds[i];
  r.hidden = false;
  r.classList.add('active');
  // reset UI
  r.querySelectorAll('.card').forEach(c => c.classList.remove('correct', 'wrong'));
  r.querySelectorAll('.card-reveal').forEach(x => x.hidden = true);
  r.querySelectorAll('.opt').forEach(b => { b.disabled = false; b.classList.remove('picked'); });
  r.querySelector('.reveal').hidden = true;
  r.querySelectorAll('.score-value').forEach(el => el.textContent = String(score));
  window.scrollTo({ top: 0, behavior: 'instant' });
}

document.querySelectorAll('section.round').forEach(round => {
  const answerIdx = parseInt(round.dataset.answer, 10);
  const roundN = parseInt(round.dataset.round, 10);

  round.querySelectorAll('.opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const picked = parseInt(btn.dataset.pick, 10);
      const correct = picked === answerIdx;
      if (correct) score++;
      picks.push({ round: roundN, picked, answer: answerIdx, correct });

      // Disable all buttons + mark picked
      round.querySelectorAll('.opt').forEach(b => b.disabled = true);
      btn.classList.add('picked');

      // Reveal cards
      round.querySelectorAll('.card-reveal').forEach(x => x.hidden = false);
      round.querySelectorAll('.card').forEach((c, i) => {
        if (answerIdx === -1) {
          // trick round — no card is 'correct', mark all as reveal
          c.classList.remove('correct', 'wrong');
        } else if (i === answerIdx) {
          c.classList.add('correct');
        } else if (i === picked && !correct) {
          c.classList.add('wrong');
        }
      });

      // Show verdict panel
      const reveal = round.querySelector('.reveal');
      const verdict = reveal.querySelector('.verdict');
      if (answerIdx === -1) {
        verdict.textContent = 'This round was a trap — all three articles were AI-generated.';
        verdict.className = 'verdict loss';
      } else {
        verdict.textContent = correct
          ? '✓ Correct — you spotted the real Colin.'
          : \`✗ Not this time. The real Colin was \${round.querySelectorAll('.card')[answerIdx].querySelector('.letter').textContent}.\`;
        verdict.className = 'verdict ' + (correct ? 'win' : 'loss');
      }
      reveal.hidden = false;
      round.querySelectorAll('.score-value').forEach(el => el.textContent = String(score));
      reveal.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

  round.querySelector('.next-btn').addEventListener('click', () => {
    currentRound++;
    if (currentRound < rounds.length) {
      showRound(currentRound);
    } else {
      showFinal();
    }
  });
});

function showFinal() {
  rounds.forEach(r => r.hidden = true);
  document.getElementById('final-score').textContent = String(score);
  const verdict = document.getElementById('final-verdict');
  if (score === 4) verdict.textContent = 'You aced every round with a real Colin — the fifth had no correct answer. Every article in Round 5 was AI-generated. Even trained readers rarely spot that live.';
  else if (score === 3) verdict.textContent = 'Strong. AI Colin fooled you once. And Round 5 had no real Colin at all — every article there was AI-generated.';
  else if (score === 2) verdict.textContent = 'AI Colin passed twice. And Round 5 had no real Colin at all — every article there was AI-generated.';
  else if (score === 1) verdict.textContent = 'AI Colin passed you most rounds. And Round 5 had no real Colin at all — every article there was AI-generated.';
  else verdict.textContent = 'The AI fooled you every round. Voice fidelity is closer than you thought — and Round 5 had no real Colin at all.';

  const breakdown = document.getElementById('breakdown');
  breakdown.innerHTML = picks.map(p => {
    const label = p.answer === -1
      ? \`Picked: \${['A','B','C'][p.picked]} — trap round, all three were AI\`
      : \`Picked: \${['A','B','C'][p.picked]} · Real: \${['A','B','C'][p.answer]}\`;
    return \`<div class="breakdown-row"><span class="rk">Round \${p.round}</span><span class="rv \${p.correct ? 'win' : 'loss'}">\${p.correct ? '✓' : '✗'} \${label}</span></div>\`;
  }).join('');

  showSlide('final');
}
</script>
</body>
</html>`;

const outDir = 'presentations';
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'turing-test.html');
writeFileSync(outPath, HTML);

// Also copy into public/ so it's served by Vercel at /turing-test.html
mkdirSync('public', { recursive: true });
writeFileSync(path.join('public', 'turing-test.html'), HTML);

console.log(`Wrote ${outPath}`);
console.log(`Also wrote public/turing-test.html — will be live at https://colin-writer.vercel.app/turing-test.html`);
console.log(`Size: ${(HTML.length / 1024).toFixed(1)} KB`);
