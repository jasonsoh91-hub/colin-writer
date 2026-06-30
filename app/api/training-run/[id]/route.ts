import { NextRequest } from 'next/server';
import { getRunById } from '@/lib/training-log';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = await getRunById(id);
  if (!row) return new Response('Not found', { status: 404 });
  return Response.json(row);
}
