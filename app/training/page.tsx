'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface TrainingRunRow {
  id: string;
  created_at: string;
  topic: string;
  persona: string;
  genre: string | null;
  word_count: number;
  raw_word_count: number | null;
  text_style_score: number;
  colin_phrases_found: number;
  generic_phrases_found: number;
  dropped_sentence_count: number;
  prefix_stripped_count: number;
}

interface TrainingStats {
  totalRuns: number;
  rollingAvgLast10: number | null;
  rollingAvgPrev10: number | null;
  delta: number | null;
  byGenre: { genre: string; avgScore: number; runs: number }[];
  trend: number[];
  recent: TrainingRunRow[];
}

interface Ceiling {
  ceilingAvg: number;
  ceilingMedian: number;
  ceilingMin: number;
  ceilingMax: number;
  sampleSize: number;
}

interface StatsResponse {
  persona: string;
  ceiling: Ceiling | null;
  stats: TrainingStats;
  fetchedAt: string;
}

function scoreColor(n: number | null | undefined): string {
  if (n === null || n === undefined) return '#666';
  if (n >= 85) return '#4ade80';
  if (n >= 70) return '#c8a84b';
  if (n >= 55) return '#fb923c';
  return '#f87171';
}

interface FeedbackRow {
  id: string;
  topic: string;
  rating: number;
  what_worked: string;
  what_to_improve: string;
  phrases_to_avoid: string;
  phrases_to_use_more: string;
  created_at: string;
}

function RecentFeedback() {
  const [rows, setRows] = useState<FeedbackRow[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/recent-feedback?limit=3').then(r => r.json()).then(d => setRows(d.rows ?? [])).catch(() => setRows([]));
  }, []);
  return (
    <div className="rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-[#aaa]">Last 3 Reviews · Feeding Next Gen</h2>
        <span className="text-[10px] text-[#c8a84b]/70 uppercase tracking-widest">MOST CRITICAL in prompt</span>
      </div>
      {rows === null && <div className="text-[#666] text-sm py-4">Loading…</div>}
      {rows && rows.length === 0 && <div className="text-[#666] text-sm py-4">No reviews yet. Submit a review via the writer to start the loop.</div>}
      {rows && rows.length > 0 && (
        <div className="space-y-2">
          {rows.map(r => {
            const isOpen = expanded === r.id;
            const color = r.rating >= 8 ? '#4ade80' : r.rating >= 6 ? '#c8a84b' : '#f87171';
            return (
              <div key={r.id} className="rounded-lg border border-[#1a1a1a] bg-[#0a0a0a] overflow-hidden">
                <button onClick={() => setExpanded(isOpen ? null : r.id)} className="w-full text-left px-4 py-3 flex items-center justify-between gap-3 hover:bg-[#111] transition">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate">{r.topic}</p>
                    <p className="text-[10px] text-[#666] mt-0.5">{timeAgo(r.created_at)} · click to {isOpen ? 'collapse' : 'expand'}</p>
                  </div>
                  <span className="text-lg font-bold tabular-nums" style={{ color }}>{r.rating}/10</span>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 pt-1 border-t border-[#1a1a1a] space-y-3 text-xs">
                    {r.what_worked && (
                      <div>
                        <p className="text-[9px] uppercase tracking-widest text-[#4ade80] font-semibold mb-1">What worked</p>
                        <p className="text-[#aaa] leading-relaxed">{r.what_worked}</p>
                      </div>
                    )}
                    {r.what_to_improve && (
                      <div>
                        <p className="text-[9px] uppercase tracking-widest text-[#f87171] font-semibold mb-1">What to improve</p>
                        <p className="text-[#aaa] leading-relaxed">{r.what_to_improve}</p>
                      </div>
                    )}
                    {r.phrases_to_avoid && (
                      <div>
                        <p className="text-[9px] uppercase tracking-widest text-[#c8a84b] font-semibold mb-1">Phrases to avoid</p>
                        <p className="text-[#aaa] leading-relaxed font-mono text-[11px]">{r.phrases_to_avoid}</p>
                      </div>
                    )}
                    {r.phrases_to_use_more && (
                      <div>
                        <p className="text-[9px] uppercase tracking-widest text-[#4ade80] font-semibold mb-1">Phrases to use more</p>
                        <p className="text-[#aaa] leading-relaxed font-mono text-[11px]">{r.phrases_to_use_more}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LoopDiagram({ stats }: { stats: TrainingStats }) {
  const [feedbackCount, setFeedbackCount] = useState<number | null>(null);
  useEffect(() => {
    fetch('/api/feedback-count').then(r => r.json()).then(d => setFeedbackCount(d.count ?? 0)).catch(() => setFeedbackCount(null));
  }, []);
  const steps = [
    { n: '1', name: 'Write', caption: 'AI generates on topic + genre', stat: stats.totalRuns, lbl: 'articles' },
    { n: '2', name: 'Track', caption: 'Score + body persist to Supabase', stat: stats.totalRuns, lbl: 'logged' },
    { n: '3', name: 'Review', caption: 'Human rates + critiques', stat: feedbackCount ?? '—', lbl: 'reviews' },
    { n: '4', name: 'Learn', caption: 'Last 8 reviews injected into prompt', stat: Math.min(feedbackCount ?? 0, 8), lbl: 'in loop' },
    { n: '5', name: 'Apply', caption: 'Model addresses critiques on next gen', stat: stats.rollingAvgLast10 !== null ? `${stats.rollingAvgLast10}%` : '—', lbl: 'avg similarity' },
  ];
  return (
    <div className="rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-[#aaa]">Feedback Loop · Live</h2>
        <span className="text-[10px] text-[#666] uppercase tracking-widest">closed cycle</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
        {steps.map(s => (
          <div key={s.n} className="rounded-lg border border-[#1a1a1a] bg-[#0a0a0a] p-4 text-center flex flex-col justify-between min-h-[130px]">
            <div>
              <div className="w-6 h-6 rounded-full bg-[#c8a84b]/15 text-[#c8a84b] flex items-center justify-center text-[11px] font-bold mx-auto mb-2">{s.n}</div>
              <p className="text-[10px] uppercase tracking-widest text-[#c8a84b] font-semibold mb-1.5">{s.name}</p>
              <p className="text-[11px] text-[#666] leading-snug mb-3">{s.caption}</p>
            </div>
            <div>
              <div className="text-xl font-bold text-white tabular-nums">{s.stat}</div>
              <div className="text-[9px] text-[#555] uppercase tracking-wider mt-0.5">{s.lbl}</div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[#c8a84b]/70 uppercase tracking-widest text-center mt-3">↑ Regenerates with every review — the loop compounds ↑</p>
    </div>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

type FullRun = Partial<TrainingRunRow> & {
  id: string;
  article_text?: string | null;
  metadata?: Record<string, unknown> | null;
};

export default function TrainingPage() {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<FullRun | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/training-stats?persona=colin&limit=200', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function openRun(id: string) {
    setSelectedLoading(true);
    setSelected({ id } as FullRun);
    try {
      const res = await fetch(`/api/training-run/${id}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const row = await res.json();
      setSelected(row);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSelected(null);
    } finally {
      setSelectedLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const ceiling = data?.ceiling;
  const stats = data?.stats;
  const rolling = stats?.rollingAvgLast10 ?? null;
  const gap = rolling !== null && ceiling ? ceiling.ceilingAvg - rolling : null;

  const trendData = (stats?.trend ?? []).map((score, i) => ({ idx: i + 1, score }));

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[#c8a84b] mb-1">Colin Writer</p>
            <h1 className="text-3xl font-bold">Voice Training Dashboard</h1>
            <p className="text-sm text-[#888] mt-1">
              How close is AI Colin to Real Colin right now, and is each iteration making it better?
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={load}
              className="px-3 py-1.5 text-xs border border-[#333] rounded-md text-[#aaa] hover:border-[#c8a84b]/60 hover:text-white transition"
            >
              ↻ Refresh
            </button>
            <Link
              href="/"
              className="px-3 py-1.5 text-xs border border-[#333] rounded-md text-[#aaa] hover:border-[#c8a84b]/60 hover:text-white transition"
            >
              ← Writer
            </Link>
          </div>
        </div>

        {loading && (
          <div className="text-center py-20 text-[#666]">Loading training data…</div>
        )}

        {error && (
          <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-4 text-sm text-red-300">
            Failed to load training stats: {error}
            <div className="text-xs text-red-400/70 mt-2">
              If this is the first time, run the migration in supabase/migrations/colin_training_runs.sql
              against the Colin Writer Supabase project.
            </div>
          </div>
        )}

        {data && stats && (
          <>
            <LoopDiagram stats={stats} />
            <RecentFeedback />

            {/* Top row — Rolling avg + Ceiling + Gap */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="rounded-xl border border-[#c8a84b]/40 bg-gradient-to-br from-[#1a1a1a] to-[#0d0d0d] p-6">
                <p className="text-[10px] uppercase tracking-widest text-[#c8a84b] mb-2">AI Colin · Rolling Avg (last 10)</p>
                <div className="flex items-end gap-3">
                  <span className="text-5xl font-bold" style={{ color: scoreColor(rolling) }}>
                    {rolling !== null ? `${rolling}%` : '—'}
                  </span>
                  {stats.delta !== null && (
                    <span
                      className={`text-sm pb-2 ${stats.delta > 0 ? 'text-green-400' : stats.delta < 0 ? 'text-red-400' : 'text-[#888]'}`}
                    >
                      {stats.delta > 0 ? '▲' : stats.delta < 0 ? '▼' : '→'} {stats.delta > 0 ? '+' : ''}
                      {stats.delta} vs prev 10
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#666] mt-3">
                  {stats.totalRuns} total generation{stats.totalRuns === 1 ? '' : 's'} logged
                </p>
              </div>

              <div className="rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] p-6">
                <p className="text-[10px] uppercase tracking-widest text-[#888] mb-2">Real Colin · Corpus Ceiling</p>
                <span className="text-5xl font-bold text-white">
                  {ceiling ? `${ceiling.ceilingAvg}%` : '—'}
                </span>
                <p className="text-xs text-[#666] mt-3">
                  {ceiling
                    ? `n=${ceiling.sampleSize} real articles · median ${ceiling.ceilingMedian}% · range ${ceiling.ceilingMin}–${ceiling.ceilingMax}%`
                    : 'computing…'}
                </p>
              </div>

              <div className="rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] p-6">
                <p className="text-[10px] uppercase tracking-widest text-[#888] mb-2">Gap to Ceiling</p>
                <span
                  className="text-5xl font-bold"
                  style={{ color: gap === null ? '#666' : gap <= 5 ? '#4ade80' : gap <= 15 ? '#c8a84b' : '#f87171' }}
                >
                  {gap === null ? '—' : `${gap > 0 ? gap : 0}%`}
                </span>
                <p className="text-xs text-[#666] mt-3">
                  {gap === null
                    ? 'Need both numbers'
                    : gap <= 0
                      ? 'AI Colin matches the corpus benchmark.'
                      : `Reduce this gap by iterating prompts, style profile, and ban list.`}
                </p>
              </div>
            </div>

            {/* Trend chart */}
            <div className="rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium text-[#aaa]">Score Trend · Last {trendData.length} Generations</h2>
                <span className="text-[10px] text-[#666] uppercase tracking-widest">target 85%</span>
              </div>
              {trendData.length === 0 ? (
                <div className="text-center py-12 text-[#555] text-sm">
                  No generations logged yet. Generate an article via the writer to populate this chart.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                    <XAxis dataKey="idx" tick={{ fill: '#666', fontSize: 11 }} axisLine={{ stroke: '#333' }} />
                    <YAxis domain={[0, 100]} tick={{ fill: '#666', fontSize: 11 }} axisLine={{ stroke: '#333' }} />
                    <Tooltip
                      contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 6, fontSize: 12 }}
                      labelStyle={{ color: '#aaa' }}
                    />
                    <ReferenceLine y={85} stroke="#c8a84b" strokeDasharray="4 4" />
                    {ceiling && (
                      <ReferenceLine y={ceiling.ceilingAvg} stroke="#4ade80" strokeDasharray="2 6" />
                    )}
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="#c8a84b"
                      strokeWidth={2}
                      dot={{ fill: '#c8a84b', r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* By genre + recent runs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] p-6">
                <h2 className="text-sm font-medium text-[#aaa] mb-4">By Genre</h2>
                {stats.byGenre.length === 0 ? (
                  <div className="text-[#555] text-sm">No data yet.</div>
                ) : (
                  <div className="space-y-3">
                    {stats.byGenre.map(g => (
                      <div key={g.genre}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-[#aaa]">{g.genre}</span>
                          <span className="text-[#666]">
                            {g.avgScore}% · n={g.runs}
                          </span>
                        </div>
                        <div className="h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${g.avgScore}%`, backgroundColor: scoreColor(g.avgScore) }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-[#2a2a2a] bg-[#0d0d0d] p-6">
                <h2 className="text-sm font-medium text-[#aaa] mb-4">Recent Generations</h2>
                {stats.recent.length === 0 ? (
                  <div className="text-[#555] text-sm">No data yet.</div>
                ) : (
                  <div className="space-y-1">
                    {stats.recent.map(r => (
                      <button
                        key={r.id}
                        onClick={() => openRun(r.id)}
                        className="w-full flex items-center justify-between gap-3 py-2 px-2 -mx-2 rounded border-b border-[#1a1a1a] last:border-0 text-left hover:bg-[#161616] transition"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-white truncate">{r.topic}</p>
                          <p className="text-[10px] text-[#666] mt-0.5">
                            {r.genre ?? 'no-genre'} · {r.word_count}w
                            {r.dropped_sentence_count + r.prefix_stripped_count > 0 &&
                              ` · ${r.dropped_sentence_count + r.prefix_stripped_count} strip`}
                            {' · '}
                            {timeAgo(r.created_at)}
                          </p>
                        </div>
                        <span
                          className="text-lg font-bold tabular-nums"
                          style={{ color: scoreColor(r.text_style_score) }}
                        >
                          {r.text_style_score}%
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <p className="text-[10px] text-[#444] mt-8 text-center">
              Updated {new Date(data.fetchedAt).toLocaleString()}
            </p>
          </>
        )}
      </div>

      {/* Article modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center p-4 sm:p-8 overflow-y-auto"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl max-w-3xl w-full my-8 max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 p-6 border-b border-[#1a1a1a]">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-widest text-[#c8a84b] mb-1">
                  {selected.genre ?? 'no-genre'} · {selected.created_at && timeAgo(selected.created_at)}
                </p>
                <h2 className="text-xl font-semibold text-white truncate">
                  {selected.topic ?? 'Loading…'}
                </h2>
                {selected.text_style_score !== undefined && (
                  <p className="text-xs text-[#888] mt-2">
                    <span className="font-bold tabular-nums" style={{ color: scoreColor(selected.text_style_score) }}>
                      {selected.text_style_score}%
                    </span>{' '}
                    similarity · {selected.word_count}w
                    {selected.raw_word_count && selected.raw_word_count !== selected.word_count &&
                      ` (raw: ${selected.raw_word_count}w)`}
                    {(selected.dropped_sentence_count ?? 0) + (selected.prefix_stripped_count ?? 0) > 0 &&
                      ` · ${selected.dropped_sentence_count ?? 0} dropped · ${selected.prefix_stripped_count ?? 0} prefix-stripped`}
                    {' · '}
                    {selected.colin_phrases_found ?? 0} Colin phrases
                    {(selected.generic_phrases_found ?? 0) > 0 && ` · ${selected.generic_phrases_found} generic`}
                  </p>
                )}
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-[#666] hover:text-white text-xl leading-none px-2"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="overflow-y-auto p-6">
              {selectedLoading || !selected.article_text ? (
                <div className="text-center py-12 text-[#666] text-sm">
                  {selectedLoading ? 'Loading article…' : 'No article body stored for this run (older row).'}
                </div>
              ) : (
                <div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap text-[#ddd] leading-relaxed">
                  {selected.article_text}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-[#1a1a1a] flex justify-between items-center text-[10px] text-[#555]">
              <span>Esc to close</span>
              {selected.article_text && (
                <button
                  onClick={() => navigator.clipboard.writeText(selected.article_text ?? '')}
                  className="px-2 py-1 border border-[#333] rounded text-[#888] hover:text-white hover:border-[#c8a84b]/40 transition"
                >
                  Copy article
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
