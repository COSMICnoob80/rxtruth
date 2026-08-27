// Reproduce the working curl vs failing paymentFetch discrepancy on Verity.
import '../src/loadEnv';
import { getPaymentFetch } from '../src/payments/x402';

async function main(): Promise<void> {
  const pf = await getPaymentFetch();
  const body = {
    Method: 'POST',
    Endpoint: '/news',
    payload: { q: 'a', country: 'US', lang: 'en', recent_days: 1 },
  };
  console.log('request body:', JSON.stringify(body));
  const r = await pf('http://13.237.89.59:7044/engine/v1/ask/9004', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  console.log('status:', r.status);
  for (const [k, v] of r.headers.entries()) {
    if (/payment|x-?402/i.test(k)) console.log(`  ${k}: ${v.slice(0, 150)}`);
  }
  const t = await r.text();
  console.log('body (400ch):', t.slice(0, 400));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
