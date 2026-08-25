// DeSearch (Telegraph subnet 101) — real-time news search Miner.
// Endpoint: POST /subnet-dispatcher/v1/101/search/mini  body: { query }

import { config } from '../config';
import { UpstreamError, formatFetchError } from '../errors';
import { getPaymentFetch, withTxCapture, type PaymentCapture } from '../payments/x402';

export interface RelatedNewsItem {
  title: string;
  source: string;
  url: string | null;
  summary: string;
}

const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 30_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const extractUrl = (text: string): string | null => {
  const m = text.match(/https?:\/\/\S+/i);
  return m ? m[0].replace(/[),.;]+$/, '') : null;
};

const sourceFromUrl = (url: string | null): string => {
  if (!url) return 'unknown';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
};

export async function searchNews(
  query: string,
  capture: PaymentCapture
): Promise<RelatedNewsItem[]> {
  const url = `${config.telegraphBaseUrl}${config.deSearchPath}`;
  const paymentFetch = await getPaymentFetch();
  const fetchWithCapture = withTxCapture(paymentFetch, capture);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetchWithCapture(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!res.ok) {
        const retryable = res.status === 429 || res.status >= 500;
        const detail = (await res.text().catch(() => '')).slice(0, 200);
        if (!retryable || attempt === MAX_ATTEMPTS) {
          throw new UpstreamError(
            'DESEARCH_HTTP_ERROR',
            `DeSearch HTTP ${res.status}: ${detail}`,
            502
          );
        }
        await sleep(2000 * attempt);
        continue;
      }

      const envelope = (await res.json()) as Record<string, unknown>;
      const body =
        typeof envelope.result === 'object' && envelope.result !== null
          ? (envelope.result as Record<string, unknown>)
          : envelope;

      // Structured results: { results: [{ title, url, content }] } or array
      const structured = Array.isArray(body)
        ? body
        : Array.isArray((body as { results?: unknown[] }).results)
          ? ((body as { results: unknown[] }).results as unknown[])
          : null;

      if (structured) {
        return structured
          .filter((it): it is Record<string, unknown> => !!it && typeof it === 'object')
          .slice(0, 5)
          .map((it, idx) => {
            const u = typeof it.url === 'string' ? it.url : null;
            const summary =
              typeof it.content === 'string'
                ? it.content.replace(/\s+/g, ' ').trim().slice(0, 320)
                : typeof it.snippet === 'string'
                  ? (it.snippet as string).replace(/\s+/g, ' ').trim().slice(0, 320)
                  : '';
            return {
              title:
                typeof it.title === 'string' && it.title.trim()
                  ? it.title.trim()
                  : `Result ${idx + 1}`,
              source: sourceFromUrl(u),
              url: u,
              summary: summary || 'No summary available',
            };
          });
      }

      // Fallback: LLM-style content string with embedded links
      const content =
        typeof (body as { content?: unknown }).content === 'string'
          ? (body as { content: string }).content
          : '';
      if (content) {
        return content
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith('|') && !l.startsWith('---'))
          .slice(0, 5)
          .map((line, idx) => {
            const u = extractUrl(line);
            return {
              title: `Result ${idx + 1}`,
              source: sourceFromUrl(u),
              url: u,
              summary: line,
            };
          });
      }

      throw new UpstreamError(
        'DESEARCH_INVALID_RESPONSE',
        `DeSearch returned unrecognized shape: ${JSON.stringify(envelope).slice(0, 200)}`,
        502
      );
    } catch (err) {
      const retryable =
        err instanceof UpstreamError
          ? false
          : ['AbortError', 'TimeoutError', 'ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT'].includes(
              (err as Error).name ?? ''
            ) || Boolean((err as NodeJS.ErrnoException).code);
      if (!retryable || attempt === MAX_ATTEMPTS) {
        if (err instanceof UpstreamError) throw err;
        throw new UpstreamError(
          'DESEARCH_NETWORK_ERROR',
          `DeSearch call failed: ${formatFetchError(err)}`,
          502
        );
      }
      await sleep(2000 * attempt);
    }
  }
  return [];
}
