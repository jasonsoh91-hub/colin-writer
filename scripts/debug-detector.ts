import { readFileSync, existsSync } from 'fs';
if (existsSync('.env.local')) {
  const env = readFileSync('.env.local', 'utf-8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

async function main() {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.allowLocalModels = false;
  env.useBrowserCache = false;

  const detector = await pipeline('text-classification', 'onnx-community/answerdotai-ModernBERT-base-ai-detector-ONNX');

  const samples = [
    { label: 'Generic AI-ish', text: 'This is a test sentence to classify.' },
    { label: 'Very human (typo)', text: 'omg i cant believe my landlord raised rent AGAIN like wtf??? this is ridiculous' },
    { label: 'Cleanly AI', text: 'In the rapidly evolving landscape of modern technology, artificial intelligence has emerged as a transformative force, fundamentally reshaping the way we approach complex problems and revolutionizing industries across the globe.' },
    { label: 'User failing sample', text: `For a lot of us who cook at home, there's comfort in knowing what goes where. Belacan in sambal. Lemongrass in tom yam. Pandan in kuih. We've spent years watching our mothers and grandmothers work these ingredients into meals, and somewhere along the way, we picked up the patterns. But some of those patterns might not be doing the ingredient justice.` },
  ];

  for (const s of samples) {
    const r = await detector(s.text, { top_k: 2 } as object);
    console.log(`${s.label}:`, r);
  }
}
main().catch(console.error);
