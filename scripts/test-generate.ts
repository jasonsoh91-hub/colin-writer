import { generateArticle } from '../lib/generator';

async function main() {
  const topic = process.argv[2] || 'Kitchen Tools You Actually Need';
  const genre = process.argv[3] || 'lifestyle-guide';

  console.log(`\nGenerating: "${topic}" [${genre}]\n${'─'.repeat(60)}\n`);

  const stream = await generateArticle(topic, { genre, witLevel: 'dry', historicalDepth: 'none', pov: 'hybrid' });
  const reader = (stream as ReadableStream).getReader();
  const decoder = new TextDecoder();
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    process.stdout.write(chunk);
    full += chunk;
  }

  console.log(`\n\n${'─'.repeat(60)}`);
  console.log(`Word count: ${full.split(/\s+/).length}`);
}

main().catch(console.error);
