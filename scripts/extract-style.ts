import { extractStyleProfile } from '../lib/style-extractor';

async function main() {
  console.log('Extracting Colin style profile...');
  const profile = await extractStyleProfile();
  console.log(`\nProfile extracted (${profile.length} chars). Saved to data/colin-style-profile.md`);
}

main().catch(console.error);
