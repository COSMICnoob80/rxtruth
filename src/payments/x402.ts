// Solana x402 payment-wrapped fetch — ScholarGuard pattern.
// Initialised once at process start, reused for all Miner calls.

import { config } from '../config';
import { formatFetchError } from '../errors';

export interface PaymentCapture {
  txHash: string | undefined;
}

function extractTxHashFromSettle(settleHeader: string): string | undefined {
  // Telegraph base64-encodes the settle JSON payload.
  const candidates = [settleHeader, Buffer.from(settleHeader, 'base64').toString('utf8')];
  for (const candidate of candidates) {
    try {
      const json = JSON.parse(candidate) as Record<string, unknown>;
      const val = json['transaction'] ?? json['tx'] ?? json['signature'];
      if (typeof val === 'string') return val;
    } catch {
      if (/^[1-9A-HJ-NP-Za-km-z]{32,88}$/.test(candidate)) return candidate;
      if (/^0x[a-fA-F0-9]{64}$/.test(candidate)) return candidate;
    }
  }
  return undefined;
}

export function extractTxHash(headers: Headers): string | undefined {
  const settle = headers.get('payment-response') ?? headers.get('x-payment-settle-response');
  if (!settle) return undefined;
  return extractTxHashFromSettle(settle);
}

export async function getPaymentFetch(): Promise<typeof fetch> {
  const solKey = config.solanaPrivateKey?.trim();
  if (!solKey) {
    console.warn('[x402] SOLANA_PRIVATE_KEY not set — Miner calls will 402');
    return fetch;
  }

  try {
    const [x402Fetch, x402Svm, solanaKit, scureBase] = await Promise.all([
      import('@x402/fetch'),
      import('@x402/svm/exact/client'),
      import('@solana/kit'),
      import('@scure/base'),
    ]);

    const { x402Client, wrapFetchWithPayment } = x402Fetch;
    const { registerExactSvmScheme } = x402Svm;
    const { createKeyPairSignerFromBytes } = solanaKit;
    const { base58 } = scureBase;

    const client = new x402Client();
    const signer = await createKeyPairSignerFromBytes(base58.decode(solKey));
    registerExactSvmScheme(client, { signer });

    console.log('[x402] payment fetch ready — Solana SVM scheme registered');
    return wrapFetchWithPayment(fetch, client) as typeof fetch;
  } catch (err) {
    console.error('[x402] init failed:', formatFetchError(err));
    console.warn('[x402] falling back to plain fetch — Miner calls may 402');
    return fetch;
  }
}

export function withTxCapture(paymentFetch: typeof fetch, capture: PaymentCapture): typeof fetch {
  return async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> => {
    const res = await paymentFetch(input, init);
    const tx = extractTxHash(res.headers);
    if (tx) capture.txHash = tx;
    return res;
  };
}
