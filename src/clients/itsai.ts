// ItsAI (Telegraph subnet 32) — AI-generated text detection Miner.
// Endpoint: POST /subnet-dispatcher/v1/32
// Body: { Method: 'POST', Endpoint: '/detect', payload: { text } }
// Requires >= 200 chars per request — short inputs are padded with neutral context.

import { config } from '../config';
import { UpstreamError, formatFetchError } from '../errors';
import { getPaymentFetch, withTxCapture, type PaymentCapture } from '../payments/x402';

const MIN_TEXT_LENGTH = 200;
const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 30_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PAD = [
  'Context for analysis: this statement was harvested from public social media and news feeds',
  'as part of a medical misinformation monitoring pipeline. Evaluate the writing style of the',
  'claim statement itself, treating this padding as neutral background text with no bearing on',
  'the verdict. The pipeline verifies viral health claims against published medical literature.',
].join(' ');

export interface AiSpamVerdict {
  isAi: boolean;
  confidence: number;
}

export async function detectAiText(
  text: string,
  capture: PaymentCapture
): Promise<AiSpamVerdict | null> {
  const url = `${config.telegraphBaseUrl}${config.itsaiPath}`;
  const paymentFetch = await getPaymentFetch();
  const fetchWithCapture = withTxCapture(paymentFetch, capture);

  const padded = text.length >= MIN_TEXT_LENGTH ? text : `${text} ${PAD}`;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetchWithCapture(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          Method: 'POST',
          Endpoint: '/detect',
          payload: { text: padded },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!res.ok) {
        const retryable = res.status === 429 || res.status >= 500;
        const detail = (await res.text().catch(() => '')).slice(0, 200);
        if (!retryable || attempt === MAX_ATTEMPTS) {
          console.error(`[itsai] HTTP ${res.status}: ${detail}`);
          return null;
        }
        await sleep(2000 * attempt);
        continue;
      }

      const envelope = (await res.json()) as Record<string, unknown>;
      const body =
        typeof envelope.result === 'object' && envelope.result !== null
          ? (envelope.result as Record<string, unknown>)
          : envelope;

      if (typeof body.answer !== 'number') {
        console.error(`[itsai] missing numeric answer: ${JSON.stringify(envelope).slice(0, 200)}`);
        return null;
      }

      return {
        isAi: body.answer === 1,
        confidence: typeof body.confidence === 'number' ? body.confidence : 0.5,
      };
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) {
        console.error('[itsai] call failed:', formatFetchError(err));
        return null;
      }
      await sleep(2000 * attempt);
    }
  }
  return null;
}
