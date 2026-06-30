import { NextRequest } from 'next/server';
import { getRecentRuns, computeStats } from '@/lib/training-log';
import { computeColinCeiling } from '@/lib/colin-ceiling';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const persona = url.searchParams.get('persona') ?? 'colin';
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '200', 10) || 200, 500);

  const [rows, ceiling] = await Promise.all([
    getRecentRuns(limit, persona),
    persona === 'colin' ? computeColinCeiling() : Promise.resolve(null),
  ]);
  const stats = computeStats(rows);

  return Response.json({
    persona,
    ceiling,
    stats,
    fetchedAt: new Date().toISOString(),
  });
}
