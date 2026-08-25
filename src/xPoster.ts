// Optional X (Twitter) auto-posting — free tier is text-only.

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

function indexTweetText(idx: DailyIndex): string {
  const top = idx.topFalseClaims[0];
  const lines = [
    `🧪 RxTruth Health Misinformation Index — ${idx.date}`,
    ``,
    `Claims verified: ${idx.totalClaims}`,
    `FALSE: ${idx.verdictCounts.FALSE} · MISLEADING: ${idx.verdictCounts.MISLEADING} · TRUE: ${idx.verdictCounts.TRUE}`,
  ];
  if (top) {
    lines.push(``);
    lines.push(`Top false claim: "${top.text.slice(0, 140)}"`);
    lines.push(`Verdict backed by ${top.txHashes.length} on-chain inference proofs ⛓️`);
  }
  lines.push(``);
  lines.push(`Built on @Telegraphprotoc intelligence layer — every verdict paid via x402`);
  return lines.join('\n').slice(0, 280);
}

export async function postIndexToX(idx: DailyIndex, svg: string): Promise<boolean> {
  const cardPath = saveIndexCard(idx, svg);

  const { appKey, appSecret, accessToken, accessSecret } = config.x;
  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    console.log(`[x] credentials not set — card saved to ${cardPath} (post manually)`);
    return false;
  }

  try {
    const { TwitterApi } = await import('twitter-api-v2');
    const client = new TwitterApi({
      appKey,
      appSecret,
      accessToken,
      accessSecret,
    });
    await client.v2.tweet(indexTweetText(idx));
    console.log(`[x] daily index posted for ${idx.date}`);
    return true;
  } catch (err) {
    console.error('[x] post failed:', (err as Error).message);
    return false;
  }
}
