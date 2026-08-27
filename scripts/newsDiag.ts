// Diagnose which field causes INVALID_NEWS_QUERY on Verity News Search.
import '../src/loadEnv';
import { getPaymentFetch } from '../src/payments/x402';

async function probe(label: string, payload: Record<string, unknown>): Promise<void> {
  const pf = await getPaymentFetch();
  const r = await pf('http://13.237.89.59:7044/engine/v1/ask/9004', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Method: 'POST', Endpoint: '/news', payload }),
  });
  const t = (await r.text()).slice(0, 200);
  console.log(`${label} -> ${r.status} | ${t}`);
}

async function main(): Promise<void> {
  await probe('minimal', { q: 'health' });
  await probe('q+country', { q: 'health', country: 'PK' });
  await probe('q+lang', { q: 'health', lang: 'en' });
  await probe('q+recent', { q: 'health', recent_days: 7 });
  await probe('q+domains', { q: 'health', domains: 'reuters.com' });
  await probe('all', {
    q: 'health',
    country: 'PK',
    lang: 'en',
    recent_days: 7,
    domains: 'reuters.com,who.int',
  });
  await probe('country as pk', { q: 'health', country: 'pk' });
  await probe('lang as eng', { q: 'health', lang: 'eng' });
  await probe('recent_days=1', { q: 'health', recent_days: 1 });
  await probe('recent_days=30', { q: 'health', recent_days: 30 });
  await probe('multi-word q', { q: 'viral health' });
  await probe('q=str+country=US', { q: 'health', country: 'US' });
  await probe('domains=array?', { q: 'health', domains: ['reuters.com', 'who.int'] });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
