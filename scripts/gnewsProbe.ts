// Compare multiple body shapes through paymentFetch against miner 210.
import '../src/loadEnv';
import { getPaymentFetch } from '../src/payments/x402';

async function probe(label: string, body: unknown): Promise<void> {
  const pf = await getPaymentFetch();
  const r = await pf('http://13.237.89.59:7044/engine/v1/ask/210', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const t = (await r.text()).slice(0, 250);
  console.log(`${label} -> ${r.status} | ${t}`);
}

async function main(): Promise<void> {
  await probe('bare {q}', { q: 'health' });
  await probe('Method/Endpoint wrapper, payload has q', {
    Method: 'POST',
    Endpoint: '/search',
    payload: { q: 'health' },
  });
  await probe('Method/Endpoint wrapper, payload has q+params', {
    Method: 'POST',
    Endpoint: '/search',
    payload: { q: 'health', lang: 'en', country: 'us', max: 10 },
  });
  await probe('Method/Endpoint, body IS q', {
    Method: 'POST',
    Endpoint: '/search',
    q: 'health',
  });
  await probe('Method/Endpoint, no payload at all', {
    Method: 'POST',
    Endpoint: '/search',
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
