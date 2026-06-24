'use client';

import { useState, useRef, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface HistoryItem { topic: string; article: string; timestamp: number; options: GenerateOptions }
interface ReviewForm { rating: number; what_worked: string; what_to_improve: string; phrases_to_avoid: string; phrases_to_use_more: string }
interface GenerateOptions { genre?: string; tone?: string; historicalDepth?: string; witLevel?: string; culturalFraming?: string; pov?: string; openingHook?: string; sourceNotes?: string }
interface Taxonomy {
  genres: { id: string; name: string; description: string; depth: string; examples: string[] }[];
  tones: { id: string; name: string; description: string }[];
  style_options: {
    historical_depth: { id: string; label: string }[];
    wit_level: { id: string; label: string }[];
    cultural_framing: { id: string; label: string }[];
    pov: { id: string; label: string }[];
  };
  opening_hook_types: { id: string; label: string; description: string }[];
}
interface SimilarityReport {
  colinAvgWordCount: number; colinAvgSentenceLength: number;
  article: { wordCount: number; avgSentenceLength: number; paragraphCount: number; colinPhrasesFound: string[]; genericPhrasesFound: string[]; startsWithHook: boolean; hasHistoricalRef: boolean; hasCulturalRef: boolean };
  textStyleScore: number; avgRating: number;
  ratingTrend: { review: number; rating: number; label: string }[];
  totalReviews: number; overallSimilarity: number;
}

const emptyReview = (): ReviewForm => ({ rating: 7, what_worked: '', what_to_improve: '', phrases_to_avoid: '', phrases_to_use_more: '' });
const emptyOptions = (): GenerateOptions => ({});

// ── Micro components ──────────────────────────────────────────────────────────

function GoldDivider() {
  return <div className="h-px bg-gradient-to-r from-transparent via-[#c8a84b] to-transparent opacity-30 my-1" />;
}

function SelectCard({ label, options, value, onChange }: { label: string; options: { id: string; label: string; description?: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-[#666] uppercase tracking-widest mb-2">{label}</p>
      <div className="grid grid-cols-1 gap-1.5">
        {options.map(opt => (
          <button
            key={opt.id}
            onClick={() => onChange(value === opt.id ? '' : opt.id)}
            className={`text-left px-3 py-2 rounded-lg border text-sm transition-all ${
              value === opt.id
                ? 'border-[#c8a84b]/60 bg-[#c8a84b]/8 text-white'
                : 'border-[#222] bg-[#0d0d0d] text-[#666] hover:border-[#333] hover:text-[#aaa]'
            }`}
          >
            <span className={`font-medium ${value === opt.id ? 'text-[#c8a84b]' : ''}`}>{opt.label}</span>
            {opt.description && <span className="block text-[11px] text-[#444] mt-0.5">{opt.description}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, highlight }: { label: string; value: string | number; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${highlight ? 'border-[#c8a84b]/50 bg-[#c8a84b]/5' : 'border-[#2a2a2a] bg-[#161616]'}`}>
      <p className="text-xs text-[#888] uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold ${highlight ? 'text-[#c8a84b]' : 'text-white'}`}>{value}</p>
      {sub && <p className="text-xs text-[#555] mt-1">{sub}</p>}
    </div>
  );
}

function SimilarityGauge({ score }: { score: number }) {
  const radius = 54; const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 75 ? '#4ade80' : score >= 50 ? '#c8a84b' : '#f87171';
  return (
    <div className="flex flex-col items-center">
      <svg width="140" height="140" className="-rotate-90">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="#2a2a2a" strokeWidth="10" />
        <circle cx="70" cy="70" r={radius} fill="none" stroke={color} strokeWidth="10" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s ease' }} />
      </svg>
      <div className="-mt-20 flex flex-col items-center">
        <span className="text-3xl font-bold text-white">{score}%</span>
        <span className="text-xs text-[#888] mt-1">similarity</span>
      </div>
    </div>
  );
}

function StyleBar({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const pct = Math.round((value / max) * 100);
  const color = pct >= 70 ? '#4ade80' : pct >= 40 ? '#c8a84b' : '#f87171';
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1"><span className="text-[#aaa]">{label}</span><span className="text-[#888]">{value}/{max}</span></div>
      <div className="h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// ── Clone Progress Banner ─────────────────────────────────────────────────────

function CloneProgress({ metrics }: { metrics: SimilarityReport }) {
  const score = metrics.overallSimilarity;
  const ratings = metrics.ratingTrend;
  const lastRating = ratings[ratings.length - 1]?.rating ?? null;
  const prevRating = ratings[ratings.length - 2]?.rating ?? null;
  const ratingDelta = lastRating !== null && prevRating !== null ? lastRating - prevRating : null;

  const phase =
    metrics.totalReviews === 0 ? 'Text analysis only — submit a review to start the learning loop' :
    score >= 85 ? 'Near clone — voice nearly identical' :
    score >= 70 ? 'Getting close — style clearly developing' :
    score >= 55 ? 'Learning — patterns emerging' :
    'Early stage — more reviews needed';

  const color = score >= 75 ? '#4ade80' : score >= 50 ? '#c8a84b' : '#f87171';

  return (
    <div className="bg-[#111] border border-[#1a1a1a] rounded-xl px-6 py-4 mb-5 flex items-center gap-8">
      <div className="flex-shrink-0 text-center w-20">
        <p className="text-[9px] text-[#444] uppercase tracking-widest mb-1">Clone Progress</p>
        <span className="text-4xl font-bold leading-none" style={{ color }}>{score}%</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex justify-between text-[10px] mb-1.5">
          <span className="text-[#444]">{phase}</span>
          {ratingDelta !== null && (
            <span className={ratingDelta > 0 ? 'text-green-400' : ratingDelta < 0 ? 'text-red-400' : 'text-[#555]'}>
              {ratingDelta > 0 ? '↑' : ratingDelta < 0 ? '↓' : '→'} {Math.abs(ratingDelta)} pts last review
            </span>
          )}
        </div>
        <div className="h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${score}%`, backgroundColor: color }} />
        </div>
        {ratings.length > 0 && (
          <div className="flex gap-1.5 mt-2 items-center">
            <span className="text-[9px] text-[#333] uppercase tracking-widest mr-1">Rounds</span>
            {ratings.map((r, i) => (
              <div key={i} title={`Round ${i + 1}: ${r.rating}/10 — ${r.label}`}
                className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold border"
                style={{
                  backgroundColor: r.rating >= 7 ? '#16653480' : r.rating >= 5 ? '#78350f80' : '#7f1d1d80',
                  borderColor: r.rating >= 7 ? '#4ade8044' : r.rating >= 5 ? '#c8a84b44' : '#f8717144',
                  color: r.rating >= 7 ? '#4ade80' : r.rating >= 5 ? '#c8a84b' : '#f87171',
                }}>
                {r.rating}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex-shrink-0 text-right space-y-1">
        <p className="text-[10px] text-[#555]"><span className="text-white font-medium">{metrics.totalReviews}</span> review{metrics.totalReviews !== 1 ? 's' : ''} logged</p>
        {metrics.avgRating > 0 && (
          <p className="text-[10px] text-[#555]">Colin avg <span className="font-medium" style={{ color }}>{metrics.avgRating.toFixed(1)}/10</span></p>
        )}
        <p className="text-[10px] text-[#555]">text score <span className="text-white font-medium">{metrics.textStyleScore}%</span></p>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [topic, setTopic] = useState('');
  const [options, setOptions] = useState<GenerateOptions>(emptyOptions());
  const [article, setArticle] = useState('');
  const [generating, setGenerating] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [copied, setCopied] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapeStatus, setScrapeStatus] = useState('');
  const [activeTab, setActiveTab] = useState<'write' | 'metrics'>('write');
  const [showCustomize, setShowCustomize] = useState(false);

  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [review, setReview] = useState<ReviewForm>(emptyReview());
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  const [metrics, setMetrics] = useState<SimilarityReport | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [feedbackRound, setFeedbackRound] = useState(0);
  const [reviewError, setReviewError] = useState('');

  const articleRef = useRef<string>('');

  useEffect(() => {
    fetch('/api/taxonomy').then(r => r.ok ? r.json() : null).then(d => d && setTaxonomy(d));
    try {
      const saved = localStorage.getItem('colin-history');
      if (saved) setHistory(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    if (history.length > 0) {
      try { localStorage.setItem('colin-history', JSON.stringify(history)); } catch {}
    }
  }, [history]);

  async function fetchMetrics(text: string) {
    setLoadingMetrics(true);
    try {
      const res = await fetch('/api/metrics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ article: text }) });
      setMetrics(await res.json());
    } catch (_) { /* silent */ }
    finally { setLoadingMetrics(false); }
  }

  async function handleGenerate() {
    if (!topic.trim() || generating) return;
    setGenerating(true); setArticle(''); setShowReview(false); setReviewSubmitted(false); setReview(emptyReview()); setMetrics(null);
    articleRef.current = '';
    try {
      const res = await fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic, options }) });
      if (!res.ok || !res.body) throw new Error(`Error ${res.status}`);
      const reader = res.body.getReader(); const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        articleRef.current += decoder.decode(value, { stream: true });
        setArticle(articleRef.current);
      }
      setHistory(prev => [{ topic, article: articleRef.current, timestamp: Date.now(), options }, ...prev.slice(0, 9)]);
      fetchMetrics(articleRef.current);
    } catch (err) { setArticle(`Error: ${err}`); }
    finally { setGenerating(false); }
  }

  async function handleSubmitReview(regenerate = false) {
    if (submittingReview) return;
    setSubmittingReview(true);
    setReviewError('');
    try {
      const res = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic, article: articleRef.current, ...review }) });
      const data = await res.json();
      if (data.success) {
        setReviewSubmitted(true);
        setShowReview(false);
        setSubmittingReview(false);
        if (regenerate) {
          setFeedbackRound(r => r + 1);
          setActiveTab('write');
          handleGenerate();
        } else {
          fetchMetrics(articleRef.current);
        }
      } else {
        setReviewError(data.error ?? 'Failed to save review. Check Supabase connection.');
      }
    } catch (err) {
      setReviewError(`Network error: ${err}`);
    } finally {
      setSubmittingReview(false);
    }
  }

  async function handleScrape() {
    setScraping(true); setScrapeStatus("Re-scraping Colin's articles...");
    try {
      const res = await fetch('/api/scrape', { method: 'POST' });
      const data = await res.json();
      setScrapeStatus(data.error ? `Error: ${data.error}` : `✓ ${data.articlesCount} articles refreshed`);
    } catch (err) { setScrapeStatus(`Error: ${err}`); }
    finally { setScraping(false); }
  }

  function setOpt<K extends keyof GenerateOptions>(key: K, val: string) {
    setOptions(prev => ({ ...prev, [key]: prev[key] === val ? undefined : val }));
  }

  const activeOptionCount = Object.values(options).filter(Boolean).length;

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white font-sans">

      {/* ── Header ── */}
      <header className="border-b border-[#1a1a1a] bg-[#0d0d0d] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[#c8a84b] font-bold text-lg tracking-widest uppercase">Top30Media</span>
            <span className="text-[#2a2a2a]">|</span>
            <span className="text-white font-medium">Colin Writer</span>
            <span className="text-[10px] text-[#444] uppercase tracking-widest ml-1">AI Style Engine</span>
          </div>
          <div className="flex items-center gap-3">
            {metrics && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#c8a84b]/30 bg-[#c8a84b]/5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#c8a84b] animate-pulse" />
                <span className="text-[#c8a84b] text-xs font-medium">{metrics.overallSimilarity}% match</span>
              </div>
            )}
            {metrics && metrics.totalReviews > 0 && (
              <span className="text-xs text-[#444]">{metrics.totalReviews} review{metrics.totalReviews > 1 ? 's' : ''} in loop</span>
            )}
            <button onClick={handleScrape} disabled={scraping} className="text-xs px-3 py-1.5 border border-[#222] rounded text-[#555] hover:text-white hover:border-[#444] disabled:opacity-40 transition-colors">
              {scraping ? 'Refreshing…' : 'Refresh Articles'}
            </button>
          </div>
        </div>
        {scrapeStatus && <div className="max-w-7xl mx-auto px-6 pb-2 text-xs text-[#555]">{scrapeStatus}</div>}
        <GoldDivider />
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 flex gap-6">

        {/* ── History sidebar ── */}
        {history.length > 0 && (
          <aside className="w-44 flex-shrink-0">
            <p className="text-[10px] font-medium text-[#444] uppercase tracking-widest mb-3">History</p>
            <ul className="space-y-1">
              {history.map(item => (
                <li key={item.timestamp}>
                  <button onClick={() => { setTopic(item.topic); setArticle(item.article); articleRef.current = item.article; setOptions(item.options); setShowReview(false); setReviewSubmitted(false); fetchMetrics(item.article); }}
                    className="w-full text-left text-sm px-3 py-2 rounded text-[#666] hover:text-white hover:bg-[#161616] transition-colors truncate">
                    {item.topic}
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        )}

        {/* ── Main ── */}
        <main className="flex-1 min-w-0">

          {/* Clone progress banner */}
          {metrics && <CloneProgress metrics={metrics} />}

          {/* Tab bar (shown after article) */}
          {article && (
            <div className="flex gap-1 mb-6 border-b border-[#1a1a1a]">
              {(['write', 'metrics'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${activeTab === tab ? 'border-[#c8a84b] text-[#c8a84b]' : 'border-transparent text-[#555] hover:text-[#888]'}`}>
                  {tab === 'metrics' ? 'Similarity Report' : 'Article'}
                </button>
              ))}
            </div>
          )}

          {/* ── Input + customization ── */}
          <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-6 mb-6">
            <label className="block text-[10px] font-medium text-[#555] uppercase tracking-widest mb-3">Topic</label>
            <div className="flex gap-3 mb-4">
              <input type="text" value={topic} onChange={e => setTopic(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleGenerate()}
                placeholder="e.g. Durian, teh tarik, sourdough, kaya toast, capsaicin…"
                className="flex-1 px-4 py-3 bg-[#0d0d0d] border border-[#222] rounded-lg text-sm text-white placeholder-[#333] focus:outline-none focus:border-[#c8a84b]/50 transition-colors" />
              <button onClick={() => setShowCustomize(v => !v)}
                className={`px-4 py-3 rounded-lg border text-sm transition-colors ${showCustomize || activeOptionCount > 0 ? 'border-[#c8a84b]/50 text-[#c8a84b] bg-[#c8a84b]/5' : 'border-[#222] text-[#555] hover:border-[#333] hover:text-[#888]'}`}>
                Style {activeOptionCount > 0 ? `(${activeOptionCount})` : '↓'}
              </button>
              <button onClick={handleGenerate} disabled={generating || !topic.trim()}
                className="px-6 py-3 bg-[#c8a84b] text-[#0d0d0d] text-sm rounded-lg font-semibold hover:bg-[#d4b45a] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                {generating ? 'Writing…' : 'Generate'}
              </button>
            </div>

            {/* Source notes — grounds AI in real facts, prevents hallucination */}
            <div className="mb-4">
              <label className="block text-[10px] font-medium text-[#555] uppercase tracking-widest mb-2">
                Source Notes <span className="text-[#333] normal-case tracking-normal">— interview quotes, key facts, venue details (optional but recommended)</span>
              </label>
              <textarea
                value={options.sourceNotes ?? ''}
                onChange={e => setOptions(prev => ({ ...prev, sourceNotes: e.target.value || undefined }))}
                placeholder="Paste real facts here: interview quotes, specific dishes, venue location, chef background, statistics, dates — anything you want the article to be grounded in. Leave empty to let AI infer from topic only."
                rows={3}
                className="w-full px-4 py-3 bg-[#0d0d0d] border border-[#1e1e1e] rounded-lg text-sm text-white placeholder-[#2a2a2a] focus:outline-none focus:border-[#c8a84b]/30 resize-none transition-colors"
              />
            </div>

            {/* Customization panel */}
            {showCustomize && taxonomy && (
              <>
                <GoldDivider />
                <div className="mt-4 grid grid-cols-3 gap-6">

                  {/* Genre */}
                  <div className="col-span-1">
                    <p className="text-[10px] font-medium text-[#666] uppercase tracking-widest mb-2">Article Genre</p>
                    <div className="space-y-1.5">
                      {taxonomy.genres.map(g => (
                        <button key={g.id} onClick={() => setOpt('genre', g.id)}
                          className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-all ${options.genre === g.id ? 'border-[#c8a84b]/60 bg-[#c8a84b]/8 text-white' : 'border-[#1e1e1e] bg-[#0d0d0d] text-[#666] hover:border-[#2a2a2a] hover:text-[#aaa]'}`}>
                          <span className={`font-medium block ${options.genre === g.id ? 'text-[#c8a84b]' : ''}`}>{g.name}</span>
                          <span className="text-[11px] text-[#444]">{g.examples.slice(0, 2).join(', ')}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Tone + Depth */}
                  <div className="col-span-1 space-y-5">
                    <SelectCard label="Tone" value={options.tone ?? ''} onChange={v => setOpt('tone', v)}
                      options={taxonomy.tones.map(t => ({ id: t.id, label: t.name, description: t.description.slice(0, 60) }))} />
                    <SelectCard label="Historical Depth" value={options.historicalDepth ?? ''} onChange={v => setOpt('historicalDepth', v)}
                      options={taxonomy.style_options.historical_depth} />
                  </div>

                  {/* Wit + Framing + POV + Hook */}
                  <div className="col-span-1 space-y-5">
                    <SelectCard label="Wit Level" value={options.witLevel ?? ''} onChange={v => setOpt('witLevel', v)}
                      options={taxonomy.style_options.wit_level} />
                    <SelectCard label="Cultural Framing" value={options.culturalFraming ?? ''} onChange={v => setOpt('culturalFraming', v)}
                      options={taxonomy.style_options.cultural_framing} />
                    <SelectCard label="Point of View" value={options.pov ?? ''} onChange={v => setOpt('pov', v)}
                      options={taxonomy.style_options.pov} />
                  </div>

                </div>

                {/* Opening hook */}
                <div className="mt-5">
                  <p className="text-[10px] font-medium text-[#666] uppercase tracking-widest mb-2">Opening Hook Style</p>
                  <div className="flex flex-wrap gap-2">
                    {taxonomy.opening_hook_types.map(h => (
                      <button key={h.id} onClick={() => setOpt('openingHook', h.id)}
                        className={`px-3 py-1.5 rounded-full border text-xs transition-all ${options.openingHook === h.id ? 'border-[#c8a84b]/60 text-[#c8a84b] bg-[#c8a84b]/8' : 'border-[#1e1e1e] text-[#555] hover:border-[#2a2a2a] hover:text-[#888]'}`}>
                        {h.label}
                      </button>
                    ))}
                  </div>
                </div>

                {activeOptionCount > 0 && (
                  <div className="mt-4 flex justify-end">
                    <button onClick={() => setOptions(emptyOptions())} className="text-xs text-[#444] hover:text-[#888] transition-colors">Clear all options</button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── WRITE TAB ── */}
          {activeTab === 'write' && (
            <>
              {(article || generating) && (
                <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-8 mb-6">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <p className="text-[10px] text-[#555] uppercase tracking-widest">Generated Article</p>
                      <p className="text-[#888] text-sm mt-0.5 flex items-center gap-2 flex-wrap">
                        {topic}
                        {options.genre && taxonomy && (
                          <span className="text-[#c8a84b] text-xs">· {taxonomy.genres.find(g => g.id === options.genre)?.name}</span>
                        )}
                        {feedbackRound > 0 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full border border-[#c8a84b]/30 bg-[#c8a84b]/8 text-[#c8a84b]">
                            {generating ? `Applying ${feedbackRound} review${feedbackRound > 1 ? 's' : ''}…` : `Feedback round ${feedbackRound}`}
                          </span>
                        )}
                      </p>
                    </div>
                    {article && !generating && (
                      <div className="flex gap-2">
                        <button onClick={() => { navigator.clipboard.writeText(article); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                          className="text-xs px-3 py-1.5 border border-[#222] rounded text-[#555] hover:text-white hover:border-[#333] transition-colors">
                          {copied ? 'Copied!' : 'Copy'}
                        </button>
                        {!reviewSubmitted && (
                          <button onClick={() => setShowReview(v => !v)}
                            className="text-xs px-3 py-1.5 bg-[#c8a84b]/8 border border-[#c8a84b]/30 rounded text-[#c8a84b] hover:bg-[#c8a84b]/15 transition-colors font-medium">
                            {showReview ? 'Hide Review' : 'Colin Reviews ↓'}
                          </button>
                        )}
                        <button onClick={() => setActiveTab('metrics')} className="text-xs px-3 py-1.5 border border-[#1e1e1e] rounded text-[#555] hover:text-white transition-colors">
                          Report →
                        </button>
                      </div>
                    )}
                  </div>
                  <GoldDivider />
                  <div className="mt-6 space-y-4">
                    {article.split('\n').map((para, i) => para.trim() ? (
                      <p key={i} className="text-[#ccc] leading-relaxed text-[15px]">{para}</p>
                    ) : null)}
                    {generating && <span className="inline-block w-0.5 h-4 bg-[#c8a84b] animate-pulse" />}
                  </div>
                  {reviewSubmitted && (
                    <div className="mt-6 p-4 bg-green-900/20 border border-green-500/20 rounded-lg">
                      <p className="text-sm text-green-400">✓ Review saved. Next article will apply this feedback.</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Review panel ── */}
              {showReview && article && !generating && (
                <div className="bg-[#111] border border-[#c8a84b]/20 rounded-xl p-8">
                  <p className="text-[10px] text-[#c8a84b] uppercase tracking-widest mb-1">Colin's Review</p>
                  <p className="text-white font-semibold text-lg mb-1">How close is this to your actual voice?</p>
                  <p className="text-[#444] text-sm mb-5">Feedback trains the next generation — be specific.</p>
                  <GoldDivider />
                  <div className="mt-5 space-y-5">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-sm text-[#aaa]">Similarity to my writing</label>
                        <span className="text-[#c8a84b] font-bold text-lg">{review.rating}/10</span>
                      </div>
                      <input type="range" min={1} max={10} value={review.rating} onChange={e => setReview(r => ({ ...r, rating: Number(e.target.value) }))} className="w-full accent-[#c8a84b]" />
                      <div className="flex justify-between text-xs text-[#333] mt-1"><span>1 — Nothing like me</span><span>10 — Could be my byline</span></div>
                    </div>
                    {[
                      { key: 'what_worked', label: 'What felt like me?', ph: 'e.g. The opening hook had the right tension. Colonial angle was natural.' },
                      { key: 'what_to_improve', label: "What didn't work? What would I rewrite?", ph: "e.g. Paragraph 3 reads like Wikipedia. I'd weave those facts into a story." },
                      { key: 'phrases_to_avoid', label: 'Phrases / patterns to never use again', ph: "e.g. In conclusion / It is worth noting / liquid sunrise" },
                      { key: 'phrases_to_use_more', label: 'Moves I want to see more of', ph: "e.g. Short punchy sentence after long one / Dry rhetorical observation" },
                    ].map(({ key, label, ph }) => (
                      <div key={key}>
                        <label className="block text-sm text-[#aaa] mb-1">{label}</label>
                        <textarea rows={2} value={review[key as keyof ReviewForm] as string} onChange={e => setReview(r => ({ ...r, [key]: e.target.value }))} placeholder={ph}
                          className="w-full px-3 py-2 bg-[#0d0d0d] border border-[#222] rounded-lg text-sm text-white placeholder-[#333] focus:outline-none focus:border-[#c8a84b]/40 resize-none" />
                      </div>
                    ))}
                    {reviewError && (
                      <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg text-xs text-red-400">{reviewError}</div>
                    )}
                    <div className="space-y-2">
                      <button onClick={() => handleSubmitReview(true)} disabled={submittingReview}
                        className="w-full py-3 bg-[#c8a84b] text-[#0d0d0d] text-sm rounded-lg font-semibold hover:bg-[#d4b45a] disabled:opacity-40 transition-colors">
                        {submittingReview ? 'Saving…' : 'Save & Regenerate →'}
                      </button>
                      <button onClick={() => handleSubmitReview(false)} disabled={submittingReview}
                        className="w-full py-2 text-xs text-[#444] hover:text-[#888] transition-colors disabled:opacity-40">
                        Save only — no regeneration
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {!article && !generating && (
                <div className="text-center py-24">
                  <p className="text-[#222] text-5xl mb-4">✦</p>
                  <p className="text-[#444] text-lg">Enter a topic and generate</p>
                  <p className="text-[#2a2a2a] text-sm mt-2">Use Style ↓ to configure genre, tone, and depth</p>
                </div>
              )}
            </>
          )}

          {/* ── METRICS TAB ── */}
          {activeTab === 'metrics' && (
            <div className="space-y-5">
              {loadingMetrics && <div className="text-center py-12 text-[#444]">Computing similarity report…</div>}
              {metrics && !loadingMetrics && (
                <>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="col-span-1 bg-[#111] border border-[#1a1a1a] rounded-xl p-6 flex flex-col items-center justify-center">
                      <p className="text-[10px] text-[#555] uppercase tracking-widest mb-4">Overall Similarity</p>
                      <SimilarityGauge score={metrics.overallSimilarity} />
                      <p className="text-xs text-[#444] mt-4 text-center">
                        {metrics.totalReviews > 0 ? `Text + ${metrics.totalReviews} review${metrics.totalReviews > 1 ? 's' : ''}` : 'Text analysis only'}
                      </p>
                    </div>
                    <div className="col-span-3 grid grid-cols-3 gap-4">
                      <StatCard label="Text Style Score" value={`${metrics.textStyleScore}%`} sub="Structural analysis" highlight />
                      <StatCard label="Word Count" value={metrics.article.wordCount} sub={`Colin avg: ${metrics.colinAvgWordCount}w`} />
                      <StatCard label="Avg Sentence" value={`${metrics.article.avgSentenceLength}w`} sub={`Colin avg: ${metrics.colinAvgSentenceLength}w`} />
                      <StatCard label="Colin Phrases" value={metrics.article.colinPhrasesFound.length} sub="Signature expressions matched" highlight={metrics.article.colinPhrasesFound.length > 0} />
                      <StatCard label="Generic Phrases" value={metrics.article.genericPhrasesFound.length} sub="Lower = better" />
                      <StatCard label="Avg Rating" value={metrics.totalReviews > 0 ? `${metrics.avgRating.toFixed(1)}/10` : '—'} sub={metrics.totalReviews > 0 ? `${metrics.totalReviews} reviews` : 'No reviews yet'} highlight={metrics.avgRating >= 7} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-6">
                      <p className="text-[10px] text-[#555] uppercase tracking-widest mb-5">Style DNA</p>
                      <StyleBar label="Opening Hook" value={metrics.article.startsWithHook ? 10 : 0} max={10} />
                      <StyleBar label="Historical References" value={metrics.article.hasHistoricalRef ? 10 : 0} max={10} />
                      <StyleBar label="Cultural Framing" value={metrics.article.hasCulturalRef ? 10 : 0} max={10} />
                      <StyleBar label="Word Count Match" value={Math.max(0, 10 - Math.round(Math.abs(metrics.article.wordCount - metrics.colinAvgWordCount) / 30))} max={10} />
                      <StyleBar label="Sentence Rhythm" value={Math.max(0, 10 - Math.round(Math.abs(metrics.article.avgSentenceLength - metrics.colinAvgSentenceLength) / 2))} max={10} />
                      <StyleBar label="Colin Signature Phrases" value={Math.min(metrics.article.colinPhrasesFound.length, 10)} max={10} />
                      <StyleBar label="No Generic Phrases" value={Math.max(0, 10 - metrics.article.genericPhrasesFound.length * 2)} max={10} />
                    </div>

                    <div className="bg-[#111] border border-[#1a1a1a] rounded-xl p-6">
                      <p className="text-[10px] text-[#555] uppercase tracking-widest mb-5">Colin's Rating Trend</p>
                      {metrics.ratingTrend.length === 0 ? (
                        <div className="h-48 flex items-center justify-center text-center">
                          <div><p className="text-[#2a2a2a] text-3xl mb-2">↑</p><p className="text-[#333] text-sm">Submit Colin's first review<br />to start tracking improvement</p></div>
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height={200}>
                          <LineChart data={metrics.ratingTrend} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                            <XAxis dataKey="review" stroke="#333" tick={{ fontSize: 11, fill: '#444' }} />
                            <YAxis domain={[0, 10]} stroke="#333" tick={{ fontSize: 11, fill: '#444' }} />
                            <Tooltip contentStyle={{ background: '#161616', border: '1px solid #2a2a2a', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: '#888' }} itemStyle={{ color: '#c8a84b' }} formatter={(v) => [`${v}/10`, 'Rating']} labelFormatter={(l) => `Review #${l}`} />
                            <ReferenceLine y={7} stroke="#c8a84b" strokeDasharray="4 4" strokeOpacity={0.2} />
                            <Line type="monotone" dataKey="rating" stroke="#c8a84b" strokeWidth={2} dot={{ fill: '#c8a84b', strokeWidth: 0, r: 4 }} activeDot={{ r: 6, fill: '#d4b45a' }} />
                          </LineChart>
                        </ResponsiveContainer>
                      )}
                      {metrics.ratingTrend.length >= 2 && (
                        <p className="text-xs text-[#444] mt-3 text-center">
                          {metrics.ratingTrend[metrics.ratingTrend.length - 1].rating > metrics.ratingTrend[0].rating
                            ? `↑ +${(metrics.ratingTrend[metrics.ratingTrend.length - 1].rating - metrics.ratingTrend[0].rating).toFixed(0)} pts from first review`
                            : 'Keep reviewing — improvement compounds'}
                        </p>
                      )}
                    </div>
                  </div>

                  {(metrics.article.colinPhrasesFound.length > 0 || metrics.article.genericPhrasesFound.length > 0) && (
                    <div className="grid grid-cols-2 gap-4">
                      {metrics.article.colinPhrasesFound.length > 0 && (
                        <div className="bg-[#111] border border-green-500/10 rounded-xl p-5">
                          <p className="text-[10px] text-green-500/60 uppercase tracking-widest mb-3">Colin Phrases Detected ✓</p>
                          <div className="flex flex-wrap gap-2">
                            {metrics.article.colinPhrasesFound.map(p => <span key={p} className="px-2 py-1 bg-green-900/20 border border-green-500/20 rounded text-xs text-green-400">{p}</span>)}
                          </div>
                        </div>
                      )}
                      {metrics.article.genericPhrasesFound.length > 0 && (
                        <div className="bg-[#111] border border-red-500/10 rounded-xl p-5">
                          <p className="text-[10px] text-red-500/60 uppercase tracking-widest mb-3">Generic Phrases ✗ (to eliminate)</p>
                          <div className="flex flex-wrap gap-2">
                            {metrics.article.genericPhrasesFound.map(p => <span key={p} className="px-2 py-1 bg-red-900/20 border border-red-500/20 rounded text-xs text-red-400">{p}</span>)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="text-center pb-4">
                    <p className="text-[#222] text-xs">Similarity improves as Colin submits more reviews · Feedback loop is cumulative and permanent</p>
                  </div>
                </>
              )}
              {!metrics && !loadingMetrics && <div className="text-center py-24 text-[#333]">Generate an article first to see the similarity report.</div>}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
