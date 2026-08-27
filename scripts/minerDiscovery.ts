// Discover which miners work through paymentFetch end-to-end (not just 402).
import '../src/loadEnv';
import { getPaymentFetch } from '../src/payments/x402';

interface Trial {
  id: string;
  endpoint: string;
  body: Record<string, unknown>;
}

const TRIALS: Trial[] = [
  { id: '210', endpoint: '/search', body: { q: 'covid' } },
  { id: '202', endpoint: '/', body: { query: 'covid' } },
  { id: '202', endpoint: '/search', body: { query: 'covid' } },
  { id: '209', endpoint: '/', body: { q: 'covid' } },
  { id: '209', endpoint: '/everything', body: { q: 'covid' } },
  { id: '23', endpoint: '/', body: { query: 'is covid a hoax?' } },
  { id: '23', endpoint: '/ask', body: { query: 'is covid a hoax?' } },
  { id: '225', endpoint: '/', body: { query: 'covid' } },
  { id: '225', endpoint: '/works', body: { search: 'covid' } },
  { id: '32', endpoint: '/detect', body: { text: 'hello world '.repeat(30) } },
];

async function main(): Promise<void> {
  const pf = await getPaymentFetch();
  for (const t of TRIALS) {
    const wrapped = { Method: 'POST', Endpoint: t.endpoint, payload: t.body };
    const r = await pf(`http://13.237.89.59:7044/engine/v1/ask/${t.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(wrapped),
    });
    const t1 = (await r.text()).slice(0, 200).replace(/\n/g, ' ');
    console.log(`id=${t.id} ep=${t.endpoint} -> ${r.status} | ${t1}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
