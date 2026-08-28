// Optional X (Twitter) auto-posting — text only on free tier.
// The image (SVG debunk card) is always saved locally even when posting
// is disabled, so the build-day demo can attach it manually.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config';
import type { DailyIndex } from './types';

const CARDS_DIR = join(process.cwd(), 'data', 'cards');

export function saveIndexCard(idx: DailyIndex, svg: string): string {
  mkdirSync(CARDS_DIR, { recursive: true });
  const path = join(CARDS_DIR, `index-${idx.date}.svg`);
  writeFileSync(path, svg);
  return path;
}

// Twitter free tier caps tweets at 280 characters. We want the
// (1) date, (2) verdict count, (3) the actual claim text, (4) on-chain
// proof count, (5) credit. Cut in that order, never the proof count.
function indexTweetText(idx: DailyIndex): string {
  const top = idx.topFalseClaims[0];
  const total = idx.totalClaims;

  if (!top) {
    return `RxTruth · ${idx.date}\n\n${total} viral health claim${total === 1 ? '' : 's'} verified in the last 24h. Zero false.\n\nBuilt on @Telegraphprotoc, every verdict paid in USDC via x402, audit trail on Solana devnet.`.slice(0, 280);
  }

  const claimSnippet = top.text.length > 110 ? `${top.text.slice(0, 109)}…` : top.text;
  const conf = (top.confidence * 100).toFixed(0);
  return [
    `RxTruth · ${idx.date}`,
    ``,
    `FALSE (${conf}%)`,
    `"${claimSnippet}"`,
    ``,
    `Today: ${idx.verdictCounts.FALSE} false, ${idx.verdictCounts.MISLEADING} misleading, ${idx.verdictCounts.TRUE} true, ${idx.verdictCounts.UNVERIFIABLE} unverifiable.`,
    ``,
    `Built on @Telegraphprotoc · ${top.txHashes.length} on-chain proofs · x402 on Solana`,
  ]
    .join('\n')
    .slice(0, 280);
}

export async function postIndexToX(idx: DailyIndex, svg: string): Promise<boolean> {
  const cardPath = saveIndexCard(idx, svg);

  const { appKey, appSecret, accessToken, accessSecret } = config.x;
  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    console.log(`[x] credentials not set, card saved to ${cardPath} (post manually)`);
    return false;
  }

  try {
    const { TwitterApi } = await import('twitter-api-v2');
    const client = new TwitterApi({ appKey, appSecret, accessToken, accessSecret });
    await client.v2.tweet(indexTweetText(idx));
    console.log(`[x] daily index posted for ${idx.date}`);
    return true;
  } catch (err) {
    console.error('[x] post failed:', (err as Error).message);
    return false;
  }
}
