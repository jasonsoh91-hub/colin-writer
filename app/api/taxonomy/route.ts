import * as fs from 'fs';
import * as path from 'path';

export const runtime = 'nodejs';

export async function GET() {
  const p = path.join(process.cwd(), 'data/colin-taxonomy.json');
  if (!fs.existsSync(p)) return Response.json({ error: 'Taxonomy not found. Run analyze-taxonomy script first.' }, { status: 404 });
  const taxonomy = JSON.parse(fs.readFileSync(p, 'utf-8'));
  return Response.json(taxonomy);
}
