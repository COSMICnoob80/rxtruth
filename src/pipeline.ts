// RxTruth pipeline — harvest → extract → spam-check → verify → persist.

import { createHash } from 'node:crypto';
import { config } from './config';
import type { ClaimRecord, HarvestedClaim, Verdict } from './types';
import { searchNews, type RelatedNewsItem } from './clients/desearch';
import { chat, chatJson } from './clients/groq';
import { detectAiText } from './clients/itsai';
import { withTxCapture, type PaymentCapture } from './payments/x402';
import { saveClaim, getClaimByHash } from './store';

export interface PipelineRunSummary {
  startedAt: string;
  finishedAt: string;
  articlesScanned: number;
  claimsHarvested: number;
  claimsVerified: number;
  claimsFailed: number;
  txHashes: string[];
}

const claimId = (text: string): string =>
  createHash('sha256').update(text.toLowerCase().replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 16);

const VALID_VERDICTS: readonly Verdict[] = ['TRUE', 'FALSE', 'MISLEADING', 'UNVERIFIABLE'];

const asVerdict = (raw: unknown): Verdict =>
  VALID_VERDICTS.includes(raw as Verdict) ? (raw as Verdict) : 'UNVERIFIABLE';

export async function runPipeline(): Promise<PipelineRunSummary> {
  const startedAt = new Date().toISOString();
  const txHashes: string[] = [];
  let articlesScanned = 0;
  const claims: HarvestedClaim[] = [];

  // ── 1. Harvest: DeSearch news sweep across configured queries ─────────
  for (const q of config.harvestQueries) {
    const capture: PaymentCapture = { txHash: undefined };
    try {
      const items: RelatedNewsItem[] = await searchNews(q, capture);
      if (capture.txHash) txHashes.push(capture.txHash);
      articlesScanned += items.length;

      for (const item of items) {
        const claimTexts = await extractClaims(item, txHashes);
        for (const text of claimTexts) {
          const id = claimId(text);
          if (claims.some((c) => c.id === id)) continue;
          if (getClaimByHash(id)) continue; // already in DB
          claims.push({
            id,
            text,
            sourceUrl: item.url,
            sourceName: item.source,
            harvestQuery: q,
            harvestedAt: new Date().toISOString(),
          });
        }
      }
    } catch (err) {
      console.error(`[pipeline] harvest failed for "${q}":`, (err as Error).message);
    }
  }

  // ── 2. Verify: cap per run to control spend ───────────────────────────
  const selected = claims.slice(0, config.maxClaimsPerRun);
  let claimsVerified = 0;
  let claimsFailed = 0;

  for (const claim of selected) {
    try {
      const record = await verifyClaim(claim, txHashes);
      saveClaim(record);
      if (record.status === 'verified') claimsVerified++;
      else claimsFailed++;
    } catch (err) {
      claimsFailed++;
      saveClaim({
        claim,
        verification: null,
        status: 'failed',
        error: (err as Error).message,
      });
      console.error('[pipeline] verify failed:', (err as Error).message);
    }
  }

  const finishedAt = new Date().toISOString();
  const summary: PipelineRunSummary = {
    startedAt,
    finishedAt,
    articlesScanned, claimsHarvested: claims.length,
    claimsVerified,
    claimsFailed,
    txHashes,
  };
  console.log(
    `[pipeline] run complete: scanned=${articlesScanned} harvested=${claims.length} ` +
      `verified=${claimsVerified} failed=${claimsFailed} txs=${txHashes.length}`
  );
  return summary;
}

async function extractClaims(
  item: RelatedNewsItem,
  txHashes: string[]
): Promise<string[]> {
  const capture: PaymentCapture = { txHash: undefined };
  try {
    const parsed = await chatJson<{ claims?: unknown }>(
      [
        {
          role: 'system',
          content:
            'You extract checkable health claims from news snippets. Return strict JSON: {"claims": ["...", "..."]}. Extract only factual, health-related assertions a doctor could verify against medical literature. No commentary. If none, return {"claims": []}.',
        },
        {
          role: 'user',
          content: `Title: ${item.title}\nSource: ${item.source}\nSnippet: ${item.summary}`,
        },
      ],
      capture
    );
    if (capture.txHash) txHashes.push(capture.txHash);

    if (!Array.isArray(parsed.claims)) return [];
    return parsed.claims
      .filter((c): c is string => typeof c === 'string' && c.trim().length > 15)
      .slice(0, 3);
  } catch (err) {
    console.error('[pipeline] extract failed:', (err as Error).message);
    if (capture.txHash) txHashes.push(capture.txHash);
    return [];
  }
}

interface VerifyShape {
  verdict: unknown;
  confidence: unknown;
  reasoning: unknown;
  sources: unknown;
}

async function verifyClaim(claim: HarvestedClaim, txHashes: string[]): Promise<ClaimRecord> {
  const capture: PaymentCapture = { txHash: undefined };
  const result = await chatJson<VerifyShape>(
    [
      {
        role: 'system',
        content: `You are a board-certified physician verifying viral health claims. Classify the claim as exactly one verdict: TRUE, FALSE, MISLEADING, or UNVERIFIABLE. Weigh mechanism plausibility, published evidence, and real clinical guidance. Return strict JSON: {"verdict": "...", "confidence": 0.0-1.0, "reasoning": "max 60 words", "sources": ["up to 3 authoritative sources (journal/guideline names)"]}.`,
      },
      {
        role: 'user',
        content: `Claim: "${claim.text}"`,
      },
    ],
    capture
  );
  if (capture.txHash) txHashes.push(capture.txHash);

  const verdict = asVerdict(result.verdict);
  const confidence =
    typeof result.confidence === 'number' ? Math.min(1, Math.max(0, result.confidence)) : 0.5;
  const reasoning = typeof result.reasoning === 'string' ? result.reasoning : 'No reasoning returned.';
  const sources = Array.isArray(result.sources)
    ? result.sources.filter((s): s is string => typeof s === 'string').slice(0, 3)
    : [];

  const spamCapture: PaymentCapture = { txHash: undefined };
  const aiSpam = await detectAiText(claim.text, spamCapture);
  if (spamCapture.txHash) txHashes.push(spamCapture.txHash);

  return {
    claim,
    verification: {
      verdict,
      confidence,
      reasoning,
      sources,
      aiSpam: aiSpam ? { isAi: aiSpam.isAi, confidence: aiSpam.confidence } : null,
      txHashes: [capture.txHash, spamCapture.txHash].filter((h): h is string => !!h),
      verifiedAt: new Date().toISOString(),
    },
    status: 'verified',
  };
}
