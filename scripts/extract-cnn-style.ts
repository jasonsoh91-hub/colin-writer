import { extractStyleProfile } from '../lib/style-extractor';
import * as fs from 'fs';

// Load .env.local manually for tsx (Next loads it for the server, not scripts)
const envFile = '.env.local';
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

async function main() {
  console.log('Extracting CNN Travel style profile from corpus...');
  const profile = await extractStyleProfile('cnn-travel');
  console.log(`\nProfile extracted (${profile.length} chars). Saved to data/personas/cnn-travel/profile.md`);
}

main().catch(err => { console.error(err); process.exit(1); });
