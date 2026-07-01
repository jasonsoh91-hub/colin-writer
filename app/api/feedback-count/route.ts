// Lightweight endpoint for the presentation slide — returns total feedback count
// so the "How the AI Learns" loop diagram can show live numbers without
// exposing full review text over the wire.

import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

export async function GET() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return Response.json({ count: 0 });
  const sb = createClient(url, key);
  const { count, error } = await sb.from('colin_feedback').select('id', { count: 'exact', head: true });
  if (error) return Response.json({ count: 0, error: error.message }, { status: 500 });
  return Response.json({ count: count ?? 0 });
}
