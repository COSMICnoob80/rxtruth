// RxTruth server — Express API + cron autonomy.
import './loadEnv'; // FIRST import — populates process.env from .env

import express from 'express';
import cron from 'node-cron';
import { config } from './config';
import { initStore, getClaimsSince, getIndexByDate } from './store';
import { runPipeline } from './pipeline';
import { buildDailyIndex, renderIndexCard } from './cards';
import { postIndexToX } from './xPoster';

const app = express();
app.use(express.json());

initStore();

const epoch = Date.now();

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    uptime_s: Math.floor((Date.now() - epoch) / 1000),
    telegraph: config.telegraphBaseUrl,
    network: config.solanaNetwork,
  });
});

app.post('/api/run', async (req, res) => {
  if (!config.runToken || req.header('x-run-token') !== config.runToken) {
    res.status(401).json({ ok: false, error: 'invalid run token' });
    return;
  }
  res.json({ ok: true, note: 'pipeline started' });
  runPipeline()
    .then(() => buildDailyIndex())
    .then((idx) => {
      const svg = renderIndexCard(idx);
      return postIndexToX(idx, svg);
    })
    .catch((err) => console.error('[server] pipeline failed:', err));
});

app.get('/api/claims', (req, res) => {
  const hours = Number(req.query.hours);
  const since = new Date(
    Date.now() - (Number.isFinite(hours) && hours > 0 ? hours : 24) * 3600_000
  ).toISOString();
  res.json({ since, claims: getClaimsSince(since) });
});

app.get('/api/index/today', async (req, res) => {
  const idx = await buildDailyIndex();
  const svg = renderIndexCard(idx);
  res.json({
    index: idx,
    card_svg: svg,
    x_posted: await postIndexToX(idx, svg),
  });
});

// ── Dashboard HTML ──────────────────────────────────────────────────────
const DASHBOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0e0f12">
<title>RxTruth — Medical Misinformation Radar</title>
<style>
  :root {
    --surface: #0e0f12;
    --surface-2: #16181d;
    --surface-3: #1d2027;
    --border: #2a2e38;
    --border-hi: #3a4150;
    --ink: #f4f1ea;
    --ink-dim: #a5a89f;
    --ink-faint: #6b6e66;
    --true: #7ad17a;
    --false: #d9695a;
    --misleading: #d9b15a;
    --unverified: #7a7f8a;
    --accent: #9ec5b3;
    --accent-deep: #5e8a76;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--surface);
    color: var(--ink);
    font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 16px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    min-height: 100vh;
    background-image: radial-gradient(ellipse at top, #1a1d24 0%, var(--surface) 60%);
  }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 2px; }

  .container { max-width: 1200px; margin: 0 auto; padding: 32px 20px 80px; }

  /* Header */
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 16px;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 36px;
  }
  .brand { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
  .brand-mark {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.22em;
    color: var(--accent);
  }
  .brand-sub {
    font-size: 12px;
    letter-spacing: 0.22em;
    color: var(--ink-faint);
    text-transform: uppercase;
  }
  .status-row { display: flex; gap: 18px; flex-wrap: wrap; font-size: 12px; color: var(--ink-faint); }
  .status-row span { display: inline-flex; align-items: center; gap: 6px; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); display: inline-block; }

  /* Hero */
  .hero { display: flex; flex-direction: column; gap: 8px; margin-bottom: 36px; }
  .hero h1 {
    margin: 0;
    font-size: clamp(28px, 4vw, 40px);
    font-weight: 600;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }
  .hero p {
    margin: 0;
    color: var(--ink-dim);
    font-size: 16px;
    max-width: 60ch;
  }

  /* Stat strip (Monitor composition) */
  .strip {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin-bottom: 36px;
  }
  @media (min-width: 720px) { .strip { grid-template-columns: repeat(4, 1fr); } }
  .stat {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 18px 20px;
  }
  .stat-label {
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ink-faint);
    margin-bottom: 12px;
  }
  .stat-value {
    font-size: 32px;
    font-weight: 600;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .v-true { color: var(--true); }
  .v-false { color: var(--false); }
  .v-misleading { color: var(--misleading); }
  .v-unverified { color: var(--unverified); }

  /* Two-column layout: card + claim feed */
  .layout {
    display: grid;
    grid-template-columns: 1fr;
    gap: 28px;
  }
  @media (min-width: 960px) { .layout { grid-template-columns: 1.4fr 1fr; } }

  .section-title {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ink-faint);
    margin: 0 0 14px;
  }
  .card-wrap {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
  }
  .card-wrap svg { width: 100%; height: auto; display: block; }

  /* Claim list */
  .feed { display: flex; flex-direction: column; gap: 10px; }
  .claim {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-left-width: 3px;
    border-radius: 6px;
    padding: 14px 16px;
  }
  .claim[data-v="FALSE"] { border-left-color: var(--false); }
  .claim[data-v="TRUE"] { border-left-color: var(--true); }
  .claim[data-v="MISLEADING"] { border-left-color: var(--misleading); }
  .claim[data-v="UNVERIFIABLE"] { border-left-color: var(--unverified); }
  .claim-text { font-size: 15px; line-height: 1.45; margin-bottom: 8px; }
  .claim-meta {
    font-size: 12px;
    color: var(--ink-faint);
    display: flex;
    flex-wrap: wrap;
    gap: 10px 16px;
    align-items: center;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid currentColor;
  }
  .pill[data-v="FALSE"] { color: var(--false); }
  .pill[data-v="TRUE"] { color: var(--true); }
  .pill[data-v="MISLEADING"] { color: var(--misleading); }
  .pill[data-v="UNVERIFIABLE"] { color: var(--unverified); }
  .tx-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--ink-faint);
  }
  .tx-pill::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 1px;
    background: var(--accent);
    display: inline-block;
  }

  /* Empty state */
  .empty {
    text-align: center;
    padding: 48px 20px;
    color: var(--ink-faint);
    border: 1px dashed var(--border);
    border-radius: 8px;
  }
  .empty-title { color: var(--ink-dim); font-size: 15px; margin-bottom: 6px; }

  /* Footer */
  .footer {
    margin-top: 48px;
    padding-top: 20px;
    border-top: 1px solid var(--border);
    font-size: 12px;
    color: var(--ink-faint);
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
  }

  @media (max-width: 480px) {
    .container { padding: 20px 16px 60px; }
    .hero h1 { font-size: 26px; }
    .stat-value { font-size: 26px; }
  }

  @media (prefers-reduced-motion: reduce) {
    * { transition: none !important; animation: none !important; }
  }
</style>
</head>
<body>
<div class="container">

  <header class="top">
    <div class="brand">
      <span class="brand-mark">RXTRUTH</span>
      <span class="brand-sub">Medical Misinformation Radar</span>
    </div>
    <div class="status-row" aria-label="system status">
      <span><span class="dot"></span> Live</span>
      <span>Telegraph engine</span>
      <span>Solana devnet</span>
    </div>
  </header>

  <section class="hero">
    <h1>Daily Health Misinformation Index</h1>
    <p>Autonomous verification of viral health claims, every verdict paid in real-time via the Telegraph intelligence layer.</p>
  </section>

  <section class="strip" aria-label="daily verdict counts">
    <div class="stat"><div class="stat-label">True</div><div class="stat-value v-true">{{TRUE}}</div></div>
    <div class="stat"><div class="stat-label">False</div><div class="stat-value v-false">{{FALSE}}</div></div>
    <div class="stat"><div class="stat-label">Misleading</div><div class="stat-value v-misleading">{{MISLEADING}}</div></div>
    <div class="stat"><div class="stat-label">Unverifiable</div><div class="stat-value v-unverified">{{UNVERIFIABLE}}</div></div>
  </section>

  <div class="layout">
    <section>
      <h2 class="section-title">Today's card · social</h2>
      {{CARD_OR_EMPTY}}
    </section>
    <section>
      <h2 class="section-title">Recent verified claims</h2>
      <div class="feed">
        {{CLAIMS_OR_EMPTY}}
      </div>
    </section>
  </div>

  <footer class="footer">
    <span>Built in Rawalpindi · powered by the Telegraph protocol</span>
    <span>Every verdict carries on-chain inference proof</span>
  </footer>

</div>
</body>
</html>`;

app.get('/', async (_req, res) => {
  const idx = getIndexByDate(pktDate());
  const claims = getClaimsSince(new Date(Date.now() - 7 * 24 * 3600_000).toISOString()).slice(-25);

  const v = idx?.verdictCounts ?? { TRUE: 0, FALSE: 0, MISLEADING: 0, UNVERIFIABLE: 0 };
  const stats = { TRUE: v.TRUE, FALSE: v.FALSE, MISLEADING: v.MISLEADING, UNVERIFIABLE: v.UNVERIFIABLE };

  const cardSection = idx
    ? `<div class="card-wrap">${renderIndexCard(idx)}</div>`
    : `<div class="empty"><div class="empty-title">No index yet for today</div><div>POST /api/run with the run token to trigger a verification cycle.</div></div>`;

  const claimsSection = claims.length === 0
    ? `<div class="empty"><div class="empty-title">No claims verified yet</div><div>Once the agent runs, viral health claims will appear here with their verdicts and on-chain proofs.</div></div>`
    : claims
        .map(
          (c) => {
            const verdict = c.verification?.verdict ?? 'UNVERIFIABLE';
            const conf = c.verification?.confidence != null
              ? `${(c.verification.confidence * 100).toFixed(0)}%`
              : '—';
            const txs = c.verification?.txHashes.length ?? 0;
            const src = c.claim.sourceName ?? 'unknown';
            return `<article class="claim" data-v="${verdict}">
              <div class="claim-text">${escapeHtml(c.claim.text)}</div>
              <div class="claim-meta">
                <span class="pill" data-v="${verdict}">${verdict} · ${conf}</span>
                <span>${escapeHtml(src)}</span>
                <span class="tx-pill">${txs} on-chain proof${txs === 1 ? '' : 's'}</span>
              </div>
            </article>`;
          }
        )
        .join('\n');

  const html = DASHBOARD_HTML
    .replace('{{TRUE}}', String(stats.TRUE))
    .replace('{{FALSE}}', String(stats.FALSE))
    .replace('{{MISLEADING}}', String(stats.MISLEADING))
    .replace('{{UNVERIFIABLE}}', String(stats.UNVERIFIABLE))
    .replace('{{CARD_OR_EMPTY}}', cardSection)
    .replace('{{CLAIMS_OR_EMPTY}}', claimsSection);

  res.type('html').send(html);
});

function pktDate(d = new Date()): string {
  return new Date(d.getTime() + 300 * 60_000).toISOString().slice(0, 10);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

cron.schedule(config.cronSchedule, () => {
  console.log('[server] cron firing pipeline + index');
  runPipeline()
    .then(() => buildDailyIndex())
    .then(async (idx) => postIndexToX(idx, renderIndexCard(idx)))
    .catch((err) => console.error('[server] cron failed:', err));
});

const port = config.port;
app.listen(port, () => {
  console.log(`[server] RxTruth listening on :${port} — cron "${config.cronSchedule}"`);
});
