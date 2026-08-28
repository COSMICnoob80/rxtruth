// Diagnose why FACT_CHECK (miner 23) returns null in the pipeline.
import '../src/loadEnv';
import { getPaymentFetch } from '../src/payments/x402';

async function main(): Promise<void> {
  const pf = await getPaymentFetch();
  const claim = 'Drinking bleach cures autism in children under 12';
  const url = 'http://13.237.89.59:7044/engine/v1/ask/23';
  const body = {
    Method: 'POST',
    Endpoint: '/query',
    payload: { question: claim, intent: 'FACT_CHECK' },
  };
  console.log('request body:', JSON.stringify(body));
  const r = await pf(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  console.log('status:', r.status);
  for (const [k, v] of r.headers.entries()) {
    if (/payment/i.test(k)) console.log(`  ${k}: ${v.slice(0, 200)}`);
  }
  const text = await r.text();
  console.log('body (800ch):', text.slice(0, 800));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
