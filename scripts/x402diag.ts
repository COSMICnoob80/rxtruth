// x402 roundtrip diagnostic — confirms payment fetch is wired correctly.
import '../src/loadEnv';
import { getPaymentFetch } from '../src/payments/x402';

async function main(): Promise<void> {
  const paymentFetch = await getPaymentFetch();
  console.log('payment fetch resolved');

  const url = 'http://13.237.89.59:7044/engine/v1/ask/901';
  const body = {
    Method: 'POST',
    Endpoint: '/chat',
    payload: {
      model: 'groq/llama-3.1-8b-instant',
      messages: [{ role: 'user', content: 'hi' }],
      max_tokens: 3,
    },
  };

  console.log('--- attempt 1 ---');
  const r1 = await paymentFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  console.log('status:', r1.status);
  for (const [k, v] of r1.headers.entries()) {
    if (/payment|x-?402/i.test(k)) console.log(`  ${k}: ${v.slice(0, 200)}`);
  }
  const t1 = await r1.text();
  console.log('body (300ch):', t1.slice(0, 300));

  if (r1.status === 402) {
    console.log('--- attempt 2 ---');
    const r2 = await paymentFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    console.log('status:', r2.status);
    for (const [k, v] of r2.headers.entries()) {
      if (/payment|x-?402/i.test(k)) console.log(`  ${k}: ${v.slice(0, 200)}`);
    }
    console.log('body (300ch):', (await r2.text()).slice(0, 300));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
