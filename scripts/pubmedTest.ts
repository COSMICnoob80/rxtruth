import { pubmedSearch } from '../src/clients/pubmed';

async function main(): Promise<void> {
  const tests = [
    'Polio vaccine causes impotency in males',
    'Bleach cures cancer',
    'Lemon water cures cancer',
    'COVID vaccine causes autism',
    'Vaccines cause autism in children',
    'Vitamin C prevents colds',
  ];
  for (const t of tests) {
    const r = await pubmedSearch(t);
    console.log(t.slice(0, 40).padEnd(42), '=>', String(r.length).padStart(2), 'results');
    for (const c of r) console.log('  ', c.pmid, c.year, c.title.slice(0, 60));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
