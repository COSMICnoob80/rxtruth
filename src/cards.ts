// Daily Health Misinformation Index — aggregation + SVG card rendering.
//
// The X debunk card is the primary 60-second judge surface. It must read
// like a credible 2025 medical-trust brand, not a debug console. Card
// stays SVG (zero asset deps, embeds inline in tweets via data URL).

import { config } from './config';
import type { ClaimRecord, DailyIndex, TopFalseClaim, Verdict } from './types';
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

// ── Verdict color tokens (OKLCH-tuned hex) ──────────────────────────────
const C = {
  surface: '#0e0f12',
  panel: '#16181d',
  border: '#2a2e38',
  ink: '#f4f1ea',
  inkDim: '#a5a89f',
  inkFaint: '#6b6e66',
  true: '#7ad17a',
  false: '#d9695a',
  misleading: '#d9b15a',
  unverified: '#7a7f8a',
  accent: '#9ec5b3',
} as const;

const escapeXml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const candidate = `${cur} ${w}`.trim();
    if (candidate.length > maxChars) {
      if (cur) lines.push(cur);
      if (lines.length === maxLines) {
        const last = lines[maxLines - 1]!;
        lines[maxLines - 1] = `${last.slice(0, maxChars - 1)}…`;
        return lines;
      }
      cur = w;
    } else {
      cur = candidate;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines;
}

function shortHost(s: string | null | undefined): string {
  if (!s) return '';
  try {
    return new URL(s).hostname.replace(/^www\./, '');
  } catch {
    return s;
  }
}

/**
 * Primary X card: 1200×630 SVG that ships inline as a tweet image.
 * Layout: eyebrow, date+spine, 4-segment verdict strip, hero claim
 * (or CLEAR empty state), provenance meta, footer. No decorative noise.
 */
export function renderIndexCard(idx: DailyIndex): string {
  const W = 1200;
  const H = 630;
  const top = idx.topFalseClaims[0];
  const total = idx.totalClaims;

  const heroText = top
    ? top.text.length > 240
      ? `${top.text.slice(0, 239)}…`
      : top.text
    : 'No false claims detected in the last 24 hours.';

  const stripY = 230;
  const stripH = 92;
  const stripX = 80;
  const stripW = W - stripX * 2;
  const segW = stripW / 4;

  const seg = (x: number, color: string, label: string, count: number): string => `
    <rect x="${x}" y="${stripY}" width="${segW - 8}" height="${stripH}" rx="6" fill="${C.panel}" stroke="${C.border}" stroke-width="1"/>
    <text x="${x + 24}" y="${stripY + 36}" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="13" font-weight="500" letter-spacing="0.12em" fill="${C.inkFaint}">${label}</text>
    <text x="${x + 24}" y="${stripY + 78}" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="42" font-weight="600" fill="${color}">${count}</text>`;

  const heroY = stripY + stripH + 50;
  const verdictColor = top ? C.false : C.accent;
  const verdictLabel = top ? 'FALSE' : 'CLEAR';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${C.surface}"/>
      <stop offset="100%" stop-color="#08090b"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <text x="80" y="86" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="14" font-weight="600" letter-spacing="0.22em" fill="${C.accent}">RXTRUTH</text>
  <text x="180" y="86" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="14" font-weight="400" letter-spacing="0.22em" fill="${C.inkFaint}">HEALTH MISINFORMATION INDEX</text>

  <line x1="80" y1="106" x2="${W - 80}" y2="106" stroke="${C.border}" stroke-width="1"/>
  <text x="80" y="140" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="20" font-weight="400" fill="${C.inkDim}">${idx.date}</text>
  <text x="${W - 80}" y="140" text-anchor="end" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="14" font-weight="400" letter-spacing="0.08em" fill="${C.inkFaint}">${total} claim${total === 1 ? '' : 's'} verified · last 24h</text>

${seg(stripX,            C.true,       'TRUE',          idx.verdictCounts.TRUE)}
${seg(stripX + segW,     C.false,      'FALSE',         idx.verdictCounts.FALSE)}
${seg(stripX + segW * 2, C.misleading, 'MISLEADING',    idx.verdictCounts.MISLEADING)}
${seg(stripX + segW * 3, C.unverified, 'UNVERIFIABLE',  idx.verdictCounts.UNVERIFIABLE)}

  <text x="80" y="${heroY - 12}" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="12" font-weight="600" letter-spacing="0.18em" fill="${verdictColor}">${verdictLabel}${top ? ` · CONFIDENCE ${(top.confidence * 100).toFixed(0)}%` : ''}</text>

  ${top
    ? wrapText(escapeXml(heroText), 64, 3)
        .map(
          (line, j) =>
            `<text x="80" y="${heroY + 24 + j * 38}" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="28" font-weight="500" fill="${C.ink}" letter-spacing="-0.005em">${line}</text>`
        )
        .join('\n  ')
    : `<text x="80" y="${heroY + 24}" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="28" font-weight="500" fill="${C.ink}" letter-spacing="-0.005em">${escapeXml(heroText)}</text>`}

  ${top
    ? `<text x="80" y="${heroY + 170}" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="15" font-style="italic" fill="${C.inkDim}">${escapeXml((top.reasoning ?? '').slice(0, 180))}</text>
       <text x="80" y="${heroY + 198}" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="13" font-weight="500" letter-spacing="0.08em" fill="${C.inkFaint}">SOURCE · ${escapeXml(shortHost(top.sourceName) || 'unknown').toUpperCase()}   ·   ${top.txHashes.length} ON-CHAIN PROOF${top.txHashes.length === 1 ? '' : 'S'}</text>`
    : `<text x="80" y="${heroY + 60}" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="15" font-style="italic" fill="${C.inkDim}">Continue submitting suspicious claims to be verified.</text>`}

  <line x1="80" y1="${H - 64}" x2="${W - 80}" y2="${H - 64}" stroke="${C.border}" stroke-width="1"/>
  <text x="80" y="${H - 36}" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="12" font-weight="500" letter-spacing="0.12em" fill="${C.inkFaint}">VERIFIED BY 6+ TELEGRAPH MINERS</text>
  <text x="${W - 80}" y="${H - 36}" text-anchor="end" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="12" font-weight="500" letter-spacing="0.12em" fill="${C.inkFaint}">PAID VIA x402 · SOLANA DEVNET</text>
</svg>`;
}

const VERDICT_COLOR_FOR: Record<Verdict, string> = {
  TRUE: C.true,
  FALSE: C.false,
  MISLEADING: C.misleading,
  UNVERIFIABLE: C.unverified,
};

/**
 * Per-claim share card: 1200×630 SVG sized for WhatsApp / X / Telegram
 * previews. Same brand voice as the daily Index card but for a single
 * debunked claim, with the on-chain audit trail visible.
 */
export function renderShareCard(record: ClaimRecord): string {
  if (!record.verification) {
    return renderIndexCard({
      date: pktDate(),
      totalClaims: 0,
      verdictCounts: { TRUE: 0, FALSE: 0, MISLEADING: 0, UNVERIFIABLE: 0 },
      topFalseClaims: [],
      generatedAt: new Date().toISOString(),
    });
  }

  const W = 1200;
  const H = 630;
  const v = record.verification;
  const claim = record.claim;
  const verdictColor = VERDICT_COLOR_FOR[v.verdict];
  const conf = `${(v.confidence * 100).toFixed(0)}%`;

  const claimLines = wrapText(escapeXml(claim.text), 62, 4);

  const sources = v.sources
    .filter((s) => s && s.length > 0)
    .slice(0, 2)
    .map((s) => escapeXml(s));

  const txLines = v.txHashes
    .slice(0, 2)
    .map((h) => escapeXml(h.slice(0, 32) + '\u2026'))
    .join('   \u00b7   ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${C.surface}"/>
      <stop offset="100%" stop-color="#08090b"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <text x="80" y="86" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="14" font-weight="600" letter-spacing="0.22em" fill="${C.accent}">RXTRUTH</text>
  <text x="180" y="86" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="14" font-weight="400" letter-spacing="0.22em" fill="${C.inkFaint}">CLAIM VERIFICATION</text>

  <line x1="80" y1="106" x2="${W - 80}" y2="106" stroke="${C.border}" stroke-width="1"/>
  <text x="80" y="148" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="20" font-weight="600" letter-spacing="-0.01em" fill="${verdictColor}">${escapeXml(v.verdict)} \u00b7 ${conf}</text>
  <text x="${W - 80}" y="148" text-anchor="end" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="14" font-weight="400" letter-spacing="0.08em" fill="${C.inkFaint}">${v.txHashes.length} ON-CHAIN PROOF${v.txHashes.length === 1 ? '' : 'S'}</text>

  ${claimLines
    .map(
      (line, j) =>
        `<text x="80" y="${190 + j * 38}" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="26" font-weight="500" fill="${C.ink}" letter-spacing="-0.005em">${line}</text>`
    )
    .join('\n  ')}

  <line x1="80" y1="380" x2="${W - 80}" y2="380" stroke="${C.border}" stroke-width="1"/>
  <text x="80" y="412" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="11" font-weight="600" letter-spacing="0.18em" fill="${C.inkFaint}">REASONING</text>
  <text x="80" y="440" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="16" font-style="italic" fill="${C.inkDim}">${escapeXml((v.reasoning || '').slice(0, 180))}</text>

  ${sources.length > 0
    ? `<text x="80" y="482" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="11" font-weight="600" letter-spacing="0.18em" fill="${C.inkFaint}">SOURCES</text>
       <text x="80" y="506" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="14" fill="${C.inkDim}">${sources.join(' \u00b7 ')}</text>`
    : ''}

  ${v.pubmed && v.pubmed.length > 0
    ? `<text x="80" y="540" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="11" font-weight="600" letter-spacing="0.18em" fill="${C.accent}">PUBMED CITATIONS</text>` +
      v.pubmed
        .slice(0, 2)
        .map(
          (c, i) =>
            `<text x="80" y="${564 + i * 24}" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="13" fill="${C.inkDim}">PMID ${c.pmid} \u00b7 ${escapeXml(String(c.year))} \u00b7 ${escapeXml(c.journal || c.title)}</text>`
        )
        .join('\n  ')
    : `<text x="80" y="540" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="11" font-weight="600" letter-spacing="0.18em" fill="${C.accent}">ON-CHAIN PROOFS</text>
       <text x="80" y="564" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="13" fill="${C.inkDim}">${txLines}</text>`}

  <line x1="80" y1="${H - 64}" x2="${W - 80}" y2="${H - 64}" stroke="${C.border}" stroke-width="1"/>
  <text x="80" y="${H - 36}" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="12" font-weight="500" letter-spacing="0.12em" fill="${C.inkFaint}">RXTRUTH.MEDICAL \u00b7 VERIFY ANY CLAIM</text>
  <text x="${W - 80}" y="${H - 36}" text-anchor="end" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="12" font-weight="500" letter-spacing="0.12em" fill="${C.inkFaint}">PAID VIA x402 \u00b7 SOLANA DEVNET</text>
</svg>`;
}

/**
 * Plain-text composition for WhatsApp / Telegram / X sharing.
 * Returns a short, human-readable message with verdict, confidence,
 * top tx hash, and a link back to the dashboard.
 */
export function composeShareText(record: ClaimRecord, baseUrl = 'https://rxtruth.app'): string {
  if (!record.verification) return `RxTruth \u2014 claim pending verification. ${baseUrl}`;
  const v = record.verification;
  const conf = `${(v.confidence * 100).toFixed(0)}%`;
  const firstHash = v.txHashes[0] ? v.txHashes[0].slice(0, 16) + '\u2026' : '\u2014';
  const lines = [
    `${v.verdict} (${conf}) \u2014 RxTruth medical verification`,
    `"${record.claim.text}"`,
    '',
    v.reasoning,
  ];
  if (v.sources.length > 0) {
    lines.push('', `Sources: ${v.sources.slice(0, 2).join(' \u00b7 ')}`);
  }
  if (v.pubmed && v.pubmed.length > 0) {
    lines.push('', 'PubMed:');
    v.pubmed.slice(0, 2).forEach((c) => {
      lines.push(`  [PMID ${c.pmid}] ${c.title} \u2014 ${c.url}`);
    });
  }
  lines.push('', `On-chain proof: ${firstHash} (Solana devnet, ${v.txHashes.length} total)`);
  lines.push(`Verify any claim yourself: ${baseUrl}`);
  return lines.join('\n').slice(0, 900);
}
