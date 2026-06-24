import * as fs from 'fs';
import * as path from 'path';

export function loadTaxonomy() {
  const p = path.join(process.cwd(), 'data/colin-taxonomy.json');
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}
