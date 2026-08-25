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

app.get('/', (_req, res) => {
  const claims = getClaimsSince(new Date(Date.now() - 7 * 24 * 3600_000).toISOString()).slice(-50);
  const today = getIndexByDate(pktDate());
  res.type('html').send(`<!doctype html>
<html><head><title>RxTruth — Medical Misinformation Radar</title>
<style>
  body{background:#0a0a0a;color:#e2e8f0;font-family:monospace;max-width:960px;margin:2rem auto;padding:0 1rem}
  h1{color:#ef4444} .v-FALSE{color:#ef4444}.v-TRUE{color:#22c55e}
  .v-MISLEADING{color:#f59e0b}.v-UNVERIFIABLE{color:#6b7280}
  .claim{border:1px solid #1e293b;border-radius:6px;padding:12px;margin:12px 0}
  .meta{color:#64748b;font-size:0.85rem}
  a{color:#38bdf8}
</style></head>
<body>
<h1>RxTruth — Medical Misinformation Radar</h1>
<p class="meta">built on the Telegraph intelligence layer · every verdict carries on-chain inference proof</p>
<h2>Today's Index</h2>
<pre>${JSON.stringify(today ?? { note: 'no index yet — trigger POST /api/run' }, null, 2)}</pre>
<h2>Recent verified claims</h2>
${claims
    .map(
      (c) => `<div class="claim">
  <div class="v-${c.verification?.verdict}">${c.verification?.verdict ?? c.status} · conf ${c.verification?.confidence?.toFixed(2) ?? '—'}</div>
  <div>${c.claim.text}</div>
  <div class="meta">${c.claim.sourceName ?? 'unknown'} · ${c.claim.sourceUrl ? `<a href="${c.claim.sourceUrl}">source</a>` : 'no source'} · txs: ${c.verification?.txHashes.length ?? 0}</div>
</div>`
    )
    .join('\n')}
</body></html>`);
});

function pktDate(d = new Date()): string {
  return new Date(d.getTime() + 300 * 60_000).toISOString().slice(0, 10);
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
