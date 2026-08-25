// Daily Health Misinformation Index — aggregation + SVG card rendering.

import { config } from './config';
import type { DailyIndex, TopFalseClaim, Verdict } from './types';
import { getClaimsSince, saveIndex, getIndexByDate } from './store';

const PKT_OFFSET_MIN = 300; // UTC+5

function pktDate(d = new Date()): string {
  const pkt = new Date(d.getTime() + PKT_OFFSET_MIN * 60_000);
  return pkt.toISOString().slice(0, 10);
}

function last24hIso(): string {
  return new Date(Date.now() - 24 * 3600_000).toISOString();
}

export async function buildDailyIndex(): Promise<DailyIndex> {
  const records = getClaimsSince(last24hIso());
  const verdictCounts: Record<Verdict, number> = { TRUE: 0, FALSE: 0, MISLEADING: 0, UNVERIFIABLE: 0 };

  const topFalse: TopFalseClaim[] = [];
  for (const r of records) {
    if (!r.verification) continue;
    verdictCounts[r.verification.verdict]++;
    if (r.verification.verdict === 'FALSE') {
      topFalse.push({
        text: r.claim.text,
        sourceName: r.claim.sourceName,
        confidence: r.verification.confidence,
        reasoning: r.verification.reasoning,
        txHashes: r.verification.txHashes,
      });
    }
  }
  topFalse.sort((a, b) => b.confidence - a.confidence);

  const idx: DailyIndex = {
    date: pktDate(),
    totalClaims: records.length,
    verdictCounts,
    topFalseClaims: topFalse.slice(0, 3),
    generatedAt: new Date().toISOString(),
  };
  saveIndex(idx);
  return idx;
}

export async function getOrBuildIndex(date?: string): Promise<DailyIndex> {
  if (date) {
    const existing = getIndexByDate(date);
    if (existing) return existing;
  }
  return buildDailyIndex();
}

const VERDICT_COLOR: Record<Verdict, string> = {
  TRUE: '#22c55e',
  FALSE: '#ef4444',
  MISLEADING: '#f59e0b',
  UNVERIFIABLE: '#6b7280',
};

const escapeXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars) {
      lines.push(cur.trim());
      cur = w;
      if (lines.length === maxLines) return lines;
    } else {
      cur = `${cur} ${w}`;
    }
  }
  if (cur.trim() && lines.length < maxLines) lines.push(cur.trim());
  return lines;
}

export function renderIndexCard(idx: DailyIndex): string {
  const W = 1200;
  const H = 630;
  const claimLines = idx.topFalseClaims.flatMap((c, i) => {
    const lines = wrapText(escapeXml(c.text), 58, 2).map((l, j) =>
      `    <text x="80" y="${330 + i * 90 + j * 26}" fill="#f1f5f9" font-size="22" font-family="monospace">${l}</text>`
    );
    const meta = `    <text x="80" y="${330 + i * 90 + 52}" fill="#ef4444" font-size="16" font-family="monospace">FALSE · conf ${c.confidence.toFixed(2)} · ${escapeXml(c.sourceName ?? 'unknown')} · proof: ${c.txHashes.length} on-chain tx</text>`;
    return [...lines, meta];
  }, [] as string[]);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#0a0a0a"/>
  <rect x="0" y="0" width="${W}" height="6" fill="#ef4444"/>
  <text x="80" y="90" fill="#ef4444" font-size="30" font-family="monospace">RxTruth — Health Misinformation Index</text>
  <text x="80" y="130" fill="#94a3b8" font-size="20" font-family="monospace">${idx.date} · Asia/Karachi · built on Telegraph intelligence layer</text>

  <text x="80" y="200" fill="#f1f5f9" font-size="22" font-family="monospace">claims verified (24h): ${idx.totalClaims}</text>
  <text x="80" y="236" fill="#22c55e" font-size="22" font-family="monospace">TRUE: ${idx.verdictCounts.TRUE}</text>
  <text x="280" y="236" fill="#ef4444" font-size="22" font-family="monospace">FALSE: ${idx.verdictCounts.FALSE}</text>
  <text x="480" y="236" fill="#f59e0b" font-size="22" font-family="monospace">MISLEADING: ${idx.verdictCounts.MISLEADING}</text>
  <text x="760" y="236" fill="#6b7280" font-size="22" font-family="monospace">UNVERIFIABLE: ${idx.verdictCounts.UNVERIFIABLE}</text>

  <text x="80" y="300" fill="#94a3b8" font-size="18" font-family="monospace">TOP FALSE CLAIMS — every verdict backed by on-chain inference proof</text>
${claimLines.join('\n')}

  <text x="80" y="${H - 60}" fill="#475569" font-size="16" font-family="monospace">mined by autonomous agent · verified by board-certified physician prompts · paid via x402 on Solana devnet</text>
</svg>`;
}
