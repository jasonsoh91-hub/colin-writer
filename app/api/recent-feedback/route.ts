// Returns last N colin_feedback rows for the /training dashboard panel.

import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '3', 10) || 3, 20);
  const sbUrl = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!sbUrl || !key) return Response.json({ rows: [] });
  const sb = createClient(sbUrl, key);
  const { data, error } = await sb
    .from('colin_feedback')
    .select('id, topic, rating, what_worked, what_to_improve, phrases_to_avoid, phrases_to_use_more, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return Response.json({ rows: [], error: error.message }, { status: 500 });
  return Response.json({ rows: data ?? [] });
}
