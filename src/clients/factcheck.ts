// Community Memory (Telegraph miner 23) — independent FACT_CHECK signal.
// Endpoint: POST /engine/v1/ask/23, /query, body: { query, intent: "FACT_CHECK" }

import { config } from '../config';
import { UpstreamError, formatFetchError } from '../errors';
import { getPaymentFetch, withTxCapture, type PaymentCapture } from '../payments/x402';

const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 30_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface FactCheckResult {
  claim: string;
  answer: string;
  evidence: string[];
  sources: string[];
}

interface MinerEnvelope {
  result?: {
    answer?: string;
    evidence?: string[];
    sources?: string[];
  };
}

export async function factCheck(
  claim: string,
  capture: PaymentCapture
): Promise<FactCheckResult | null> {
  const url = `${config.telegraphBaseUrl}/engine/v1/ask/23`;
  const paymentFetch = await getPaymentFetch();
  const fetchWithCapture = withTxCapture(paymentFetch, capture);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetchWithCapture(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          Method: 'POST',
          Endpoint: '/query',
          payload: { query: claim, intent: 'FACT_CHECK' },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!res.ok) {
        const retryable = res.status === 429 || res.status >= 500;
        if (!retryable || attempt === MAX_ATTEMPTS) {
          console.error(`[factcheck] HTTP ${res.status}`);
          return null;
        }
        await sleep(2000 * attempt);
        continue;
      }

      const envelope = (await res.json()) as MinerEnvelope;
      const body = envelope.result ?? {};
      const answer = typeof body.answer === 'string' ? body.answer : '';
      if (!answer) {
        console.error('[factcheck] empty answer');
        return null;
      }

      return {
        claim,
        answer,
        evidence: Array.isArray(body.evidence)
          ? body.evidence.filter((s): s is string => typeof s === 'string').slice(0, 3)
          : [],
        sources: Array.isArray(body.sources)
          ? body.sources.filter((s): s is string => typeof s === 'string').slice(0, 3)
          : [],
      };
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) {
        console.error('[factcheck] call failed:', formatFetchError(err));
        return null;
      }
      await sleep(2000 * attempt);
    }
  }
  return null;
}
