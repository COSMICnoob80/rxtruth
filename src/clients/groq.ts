// Groq LLM (Telegraph subnet 102) — OpenAI-compatible chat Miner.
// Endpoint: POST /subnet-dispatcher/v1/102/chat
// Body: { model, messages, max_tokens } — response unwrapped from { result }

import { config } from '../config';
import { UpstreamError, formatFetchError } from '../errors';
import { getPaymentFetch, withTxCapture, type PaymentCapture } from '../payments/x402';

const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 45_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function chat(
  messages: ChatMessage[],
  capture: PaymentCapture,
  maxTokens = 700
): Promise<string> {
  const url = `${config.telegraphBaseUrl}${config.groqPath}`;
  const paymentFetch = await getPaymentFetch();
  const fetchWithCapture = withTxCapture(paymentFetch, capture);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetchWithCapture(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          model: config.groqModel,
          messages,
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!res.ok) {
        const retryable = res.status === 429 || res.status >= 500;
        const detail = (await res.text().catch(() => '')).slice(0, 200);
        if (!retryable || attempt === MAX_ATTEMPTS) {
          throw new UpstreamError('GROQ_HTTP_ERROR', `Groq HTTP ${res.status}: ${detail}`, 502);
        }
        await sleep(2000 * attempt);
        continue;
      }

      const envelope = (await res.json()) as Record<string, unknown>;
      const body =
        typeof envelope.result === 'object' && envelope.result !== null
          ? (envelope.result as Record<string, unknown>)
          : envelope;

      const content =
        typeof (body as { content?: unknown }).content === 'string'
          ? (body as { content: string }).content
          : typeof (envelope as { choices?: unknown[] }).choices === 'object'
            ? ((envelope as { choices: Array<{ message?: { content?: unknown } }> }).choices?.[0]
                ?.message?.content as string | undefined)
            : undefined;

      if (typeof content !== 'string' || !content.trim()) {
        throw new UpstreamError(
          'GROQ_INVALID_RESPONSE',
          `Groq returned no content: ${JSON.stringify(envelope).slice(0, 200)}`,
          502
        );
      }
      return content;
    } catch (err) {
      const retryable =
        err instanceof UpstreamError
          ? false
          : ['AbortError', 'TimeoutError', 'ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT'].includes(
              (err as Error).name ?? ''
            );
      if (!retryable || attempt === MAX_ATTEMPTS) {
        if (err instanceof UpstreamError) throw err;
        throw new UpstreamError(
          'GROQ_NETWORK_ERROR',
          `Groq call failed: ${formatFetchError(err)}`,
          502
        );
      }
      await sleep(2000 * attempt);
    }
  }
  return '';
}

export async function chatJson<T>(messages: ChatMessage[], capture: PaymentCapture): Promise<T> {
  const raw = await chat(messages, capture);
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ? fenced[1].trim() : raw.trim();
  try {
    return JSON.parse(candidate) as T;
  } catch {
    throw new UpstreamError(
      'GROQ_JSON_PARSE',
      `Groq response was not valid JSON: ${raw.slice(0, 200)}`,
      502
    );
  }
}
