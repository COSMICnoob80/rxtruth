// Community Memory (Telegraph miner 23) — independent FACT_CHECK signal.
// Endpoint: POST /engine/v1/ask/23, /query, body: { question, intent: "FACT_CHECK" }
// Response shape: { result: { community_attribution: [...], results: [...] } }
// — there is no `answer` field; we synthesize one from the top-weighted
// community + a quoted result so the pipeline can store something human-readable.

import { config } from '../config';
import { formatFetchError } from '../errors';
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
    community_attribution?: Array<{ community_id: string; weight: number }>;
    results?: Array<{ content?: string; author_id?: string; community_id?: string }>;
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
          payload: { question: claim, intent: 'FACT_CHECK' },
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
      const communities = Array.isArray(body.community_attribution)
        ? body.community_attribution
        : [];
      const results = Array.isArray(body.results) ? body.results : [];

      if (communities.length === 0 && results.length === 0) {
        console.error('[factcheck] empty response from community memory');
        return null;
      }

      // Synthesize a human-readable answer summarizing the retrieval
      const topCommunity = communities[0];
      const topResult = results[0];
      const answerParts: string[] = [];
      if (topCommunity) {
        answerParts.push(
          `Top community weight ${(topCommunity.weight * 100).toFixed(1)}% (id ${topCommunity.community_id.slice(0, 8)})`
        );
      }
      if (topResult?.content) {
        answerParts.push(`Top retrieved content: "${topResult.content.slice(0, 200)}"`);
      }

      // Extract quoted content as evidence, deduped
      const evidence = results
        .map((r) => r?.content)
        .filter((c): c is string => typeof c === 'string' && c.length > 0)
        .map((c) => c.slice(0, 200))
        .slice(0, 3);

      // Synthesize sources from community IDs (they're identifiers, not URLs,
      // but they preserve provenance for the on-chain audit trail)
      const sources = communities
        .slice(0, 3)
        .map((c) => `community:${c.community_id.slice(0, 8)} (weight ${c.weight.toFixed(2)})`);

      return {
        claim,
        answer: answerParts.join(' | ') || 'community memory returned no result',
        evidence,
        sources,
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
