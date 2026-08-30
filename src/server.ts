// RxTruth server — Express API + cron autonomy.
import './loadEnv'; // FIRST import — populates process.env from .env

import express from 'express';
import cron from 'node-cron';
import { createHash } from 'node:crypto';
import { config } from './config';
import { initStore, getClaimsSince, getIndexByDate, saveClaim } from './store';
import { runPipeline } from './pipeline';
import { buildDailyIndex, renderIndexCard } from './cards';
import { postIndexToX } from './xPoster';
import { chatJson } from './clients/groq';
import { detectAiText } from './clients/itsai';
import { factCheck } from './clients/factcheck';
import { type PaymentCapture } from './payments/x402';
import type { ClaimRecord, Verdict } from './types';

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

interface VerifyRequestBody {
  claim?: string;
}
interface VerifyResponse {
  verdict: Verdict;
  confidence: number;
  reasoning: string;
  sources: string[];
  txHashes: string[];
  aiSpam: { isAi: boolean; confidence: number } | null;
  factCheck: { answer: string; sources: string[] } | null;
  duration_ms: number;
}
const VERDICT_WHITELIST: readonly Verdict[] = ['TRUE', 'FALSE', 'MISLEADING', 'UNVERIFIABLE'];

app.post('/api/claims/verify', async (req, res) => {
  const body = req.body as VerifyRequestBody;
  const claim = (body.claim ?? '').trim();
  if (claim.length < 10) {
    res.status(400).json({ error: 'claim must be at least 10 characters' });
    return;
  }
  if (claim.length > 500) {
    res.status(400).json({ error: 'claim must be 500 characters or fewer' });
    return;
  }
  const startedAt = Date.now();
  try {
    const txHashes: string[] = [];
    const capture: PaymentCapture = { txHash: undefined };
    const r = await chatJson<{ verdict?: unknown; confidence?: unknown; reasoning?: unknown; sources?: unknown }>(
      [
        {
          role: 'system',
          content:
            'You are a board-certified physician verifying viral health claims. Classify the claim as exactly one verdict: TRUE, FALSE, MISLEADING, or UNVERIFIABLE. Weigh mechanism plausibility, published evidence, and real clinical guidance. Return strict JSON: {"verdict": "...", "confidence": 0.0-1.0, "reasoning": "max 60 words", "sources": ["up to 3 authoritative sources (journal/guideline names)"]}.',
        },
        { role: 'user', content: `Claim: "${claim}"` },
      ],
      capture
    );
    if (capture.txHash) txHashes.push(capture.txHash);
    const verdict = VERDICT_WHITELIST.includes(r.verdict as Verdict) ? (r.verdict as Verdict) : 'UNVERIFIABLE';
    const confidence = typeof r.confidence === 'number' ? Math.min(1, Math.max(0, r.confidence)) : 0.5;
    const reasoning = typeof r.reasoning === 'string' ? r.reasoning : 'No reasoning returned.';
    const sources = Array.isArray(r.sources) ? r.sources.filter((s): s is string => typeof s === 'string').slice(0, 3) : [];

    const spamCapture: PaymentCapture = { txHash: undefined };
    const aiSpam = await detectAiText(claim, spamCapture);
    if (spamCapture.txHash) txHashes.push(spamCapture.txHash);

    const fcCapture: PaymentCapture = { txHash: undefined };
    const fc = await factCheck(claim, fcCapture);
    if (fcCapture.txHash) txHashes.push(fcCapture.txHash);

    const mergedSources = [...sources, ...(fc?.sources ?? [])]
      .filter((s, i, arr) => arr.indexOf(s) === i)
      .slice(0, 3);

    const response: VerifyResponse = {
      verdict,
      confidence,
      reasoning,
      sources: mergedSources,
      txHashes,
      aiSpam: aiSpam ? { isAi: aiSpam.isAi, confidence: aiSpam.confidence } : null,
      factCheck: fc ? { answer: fc.answer, sources: fc.sources } : null,
      duration_ms: Date.now() - startedAt,
    };

    const id = createHash('sha256').update(claim.toLowerCase().replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 16);
    const record: ClaimRecord = {
      claim: {
        id,
        text: claim,
        sourceUrl: null,
        sourceName: 'manual check',
        harvestQuery: 'manual',
        harvestedAt: new Date().toISOString(),
      },
      verification: {
        verdict,
        confidence,
        reasoning,
        sources: mergedSources,
        aiSpam: aiSpam ? { isAi: aiSpam.isAi, confidence: aiSpam.confidence } : null,
        factCheck: fc ? { answer: fc.answer, evidence: fc.evidence, sources: fc.sources } : null,
        txHashes,
        verifiedAt: new Date().toISOString(),
      },
      status: 'verified',
    };
    try {
      saveClaim(record);
    } catch (e) {
      console.error('[server] saveClaim failed:', (e as Error).message);
    }

    res.json(response);
  } catch (err) {
    console.error('[server] verify failed:', (err as Error).message);
    res.status(500).json({ error: 'verification failed', detail: (err as Error).message });
  }
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
    font-size: 16px; line-height: 1.5;
    -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
    min-height: 100vh;
    background-image: radial-gradient(ellipse at top, #1a1d24 0%, var(--surface) 60%);
  }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  a:focus-visible, button:focus-visible, input:focus-visible, textarea:focus-visible {
    outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 2px;
  }
  button { font-family: inherit; cursor: pointer; }

  .container { max-width: 1280px; margin: 0 auto; padding: 28px 24px 80px; }

  /* ─── Top bar ─── */
  .top {
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 16px;
    padding-bottom: 20px; border-bottom: 1px solid var(--border);
    margin-bottom: 28px;
  }
  .brand { display: flex; align-items: center; gap: 14px; }
  .brand-mark {
    width: 44px; height: 44px; border-radius: 10px;
    background: var(--surface-2); border: 1.5px solid var(--accent);
    display: inline-flex; align-items: center; justify-content: center;
    color: var(--accent); font-weight: 700; font-size: 14px; letter-spacing: -0.01em;
  }
  .brand-text { display: flex; flex-direction: column; gap: 2px; }
  .brand-name { font-size: 18px; font-weight: 700; color: var(--ink); letter-spacing: -0.015em; }
  .brand-sub { font-size: 11px; font-weight: 500; letter-spacing: 0.18em; color: var(--accent); text-transform: uppercase; }

  .top-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .status-row { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: var(--ink-faint); }
  .status-row span { display: inline-flex; align-items: center; gap: 6px; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); display: inline-block; }
  .dot.pulse { animation: pulse 2s ease-in-out infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

  /* ─── Buttons ─── */
  .btn {
    display: inline-flex; align-items: center; gap: 8px;
    height: 40px; padding: 0 16px;
    font-size: 13px; font-weight: 600; letter-spacing: 0.04em;
    border-radius: 8px; border: 1px solid transparent;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }
  .btn-primary { background: var(--accent); color: #0a1f17; }
  .btn-primary:hover { background: #b6d6c5; }
  .btn-secondary { background: var(--surface-2); color: var(--ink); border-color: var(--border); }
  .btn-secondary:hover { border-color: var(--border-hi); background: var(--surface-3); }
  .btn-ghost { background: transparent; color: var(--ink-dim); }
  .btn-ghost:hover { color: var(--ink); }
  .btn[disabled] { opacity: 0.5; cursor: not-allowed; }

  /* ─── Hero ─── */
  .hero { display: flex; flex-direction: column; gap: 6px; margin-bottom: 24px; }
  .hero h1 { margin: 0; font-size: clamp(28px, 4vw, 40px); font-weight: 600; letter-spacing: -0.02em; line-height: 1.1; }
  .hero p { margin: 0; color: var(--ink-dim); font-size: 16px; max-width: 60ch; }

  /* ─── Stat strip ─── */
  .strip { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 28px; }
  @media (min-width: 720px) { .strip { grid-template-columns: repeat(4, 1fr); } }
  .stat {
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 10px; padding: 18px 20px;
    transition: border-color 0.15s ease;
  }
  .stat:hover { border-color: var(--border-hi); }
  .stat-label { font-size: 11px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink-faint); margin-bottom: 10px; }
  .stat-value { font-size: 32px; font-weight: 600; line-height: 1; font-variant-numeric: tabular-nums; }
  .stat-foot { font-size: 11px; color: var(--ink-faint); margin-top: 6px; }
  .v-true { color: var(--true); }
  .v-false { color: var(--false); }
  .v-misleading { color: var(--misleading); }
  .v-unverified { color: var(--unverified); }

  /* ─── Claim checker (interactive) ─── */
  .checker {
    background: var(--surface-2); border: 1px solid var(--border);
    border-radius: 12px; padding: 20px; margin-bottom: 28px;
  }
  .checker-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
  .checker-title { font-size: 15px; font-weight: 600; color: var(--ink); }
  .checker-hint { font-size: 12px; color: var(--ink-faint); }
  .checker-row { display: flex; gap: 10px; flex-wrap: wrap; }
  .checker-input {
    flex: 1 1 320px; min-height: 44px; padding: 10px 14px;
    font-family: inherit; font-size: 14px; line-height: 1.4;
    color: var(--ink); background: var(--surface);
    border: 1px solid var(--border); border-radius: 8px;
    resize: vertical;
  }
  .checker-input::placeholder { color: var(--ink-faint); }
  .checker-result { margin-top: 16px; }

  /* ─── Layout ─── */
  .layout { display: grid; grid-template-columns: 1fr; gap: 28px; }
  @media (min-width: 960px) { .layout { grid-template-columns: 1.4fr 1fr; } }

  .section { background: var(--surface-2); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
  .section-head {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 14px 18px; border-bottom: 1px solid var(--border);
  }
  .section-title { font-size: 12px; font-weight: 700; letter-spacing: 0.18em; color: var(--ink); text-transform: uppercase; }
  .section-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .section-body { padding: 18px; }

  .card-wrap { padding: 0; }
  .card-wrap svg { width: 100%; height: auto; display: block; }

  /* ─── Filter chips + search ─── */
  .filter-row { display: flex; gap: 6px; flex-wrap: wrap; }
  .chip {
    display: inline-flex; align-items: center; gap: 6px;
    height: 30px; padding: 0 12px;
    font-size: 12px; font-weight: 600; letter-spacing: 0.04em;
    border-radius: 999px; border: 1px solid var(--border);
    color: var(--ink-dim); background: transparent;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }
  .chip:hover { color: var(--ink); border-color: var(--border-hi); }
  .chip[aria-pressed="true"] { background: var(--accent); color: #0a1f17; border-color: var(--accent); }
  .chip-count { font-size: 10px; opacity: 0.7; font-variant-numeric: tabular-nums; }

  .search {
    height: 32px; padding: 0 12px 0 32px; min-width: 180px; flex: 0 1 240px;
    font-family: inherit; font-size: 13px;
    color: var(--ink); background: var(--surface);
    border: 1px solid var(--border); border-radius: 8px;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='%236b6e66'><path d='M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.099zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z'/></svg>");
    background-repeat: no-repeat; background-position: 9px 50%; background-size: 13px;
  }
  .search::placeholder { color: var(--ink-faint); }

  /* ─── Claim feed ─── */
  .feed { display: flex; flex-direction: column; gap: 10px; }
  .claim {
    background: var(--surface-3); border: 1px solid var(--border);
    border-left-width: 3px; border-radius: 6px;
    padding: 14px 16px;
    transition: border-color 0.15s;
  }
  .claim:hover { border-color: var(--border-hi); }
  .claim[data-v="FALSE"] { border-left-color: var(--false); }
  .claim[data-v="TRUE"] { border-left-color: var(--true); }
  .claim[data-v="MISLEADING"] { border-left-color: var(--misleading); }
  .claim[data-v="UNVERIFIABLE"] { border-left-color: var(--unverified); }
  .claim-text { font-size: 15px; line-height: 1.45; margin-bottom: 8px; color: var(--ink); }
  .claim-meta {
    font-size: 12px; color: var(--ink-faint);
    display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center;
  }
  .pill {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase;
    padding: 2px 8px; border-radius: 999px; border: 1px solid currentColor;
  }
  .pill[data-v="FALSE"] { color: var(--false); }
  .pill[data-v="TRUE"] { color: var(--true); }
  .pill[data-v="MISLEADING"] { color: var(--misleading); }
  .pill[data-v="UNVERIFIABLE"] { color: var(--unverified); }
  .tx-pill { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--ink-faint); }
  .tx-pill::before {
    content: ''; width: 8px; height: 8px; border-radius: 1px; background: var(--accent); display: inline-block;
  }
  .claim-empty { color: var(--ink-faint); font-size: 13px; padding: 16px 0; }

  /* ─── Footer ─── */
  .footer {
    margin-top: 48px; padding-top: 20px;
    border-top: 1px solid var(--border);
    font-size: 12px; color: var(--ink-faint);
    display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px;
  }
  .footer a { color: var(--ink-dim); }

  @media (max-width: 480px) {
    .container { padding: 20px 16px 60px; }
    .hero h1 { font-size: 24px; }
    .stat-value { font-size: 26px; }
    .checker-row { flex-direction: column; }
    .checker-input { flex: 1 1 auto; }
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
      <span class="brand-mark" aria-hidden="true">Rx</span>
      <span class="brand-text">
        <span class="brand-name">RxTruth</span>
        <span class="brand-sub">Medical Misinformation Radar</span>
      </span>
    </div>
    <div class="top-actions">
      <div class="status-row" aria-label="system status">
        <span><span class="dot pulse"></span> Live</span>
        <span>Telegraph engine</span>
        <span>Solana devnet</span>
      </div>
      <button class="btn btn-secondary" id="run-btn" type="button">Run now</button>
    </div>
  </header>

  <section class="hero">
    <h1>Daily Health Misinformation Index</h1>
    <p>Autonomous verification of viral health claims, every verdict paid in real time via the Telegraph intelligence layer.</p>
  </section>

  <section class="checker" aria-label="Check a claim">
    <div class="checker-head">
      <div class="checker-title">Check a claim</div>
      <div class="checker-hint">Paste any health claim — verify in real time. ~$0.03 per check (3 paid Miner calls).</div>
    </div>
    <form class="checker-row" id="check-form" autocomplete="off">
      <textarea
        class="checker-input"
        id="check-input"
        name="claim"
        rows="2"
        placeholder="e.g. Drinking lemon water every morning cures cancer in two weeks"
        maxlength="500"
        required></textarea>
      <button class="btn btn-primary" type="submit" id="check-submit">Verify claim</button>
    </form>
    <div class="checker-result" id="check-result" aria-live="polite"></div>
  </section>

  <section class="strip" aria-label="Daily verdict counts">
    <div class="stat"><div class="stat-label">True</div><div class="stat-value v-true" data-stat="TRUE">{{TRUE}}</div><div class="stat-foot">verified today</div></div>
    <div class="stat"><div class="stat-label">False</div><div class="stat-value v-false" data-stat="FALSE">{{FALSE}}</div><div class="stat-foot">verified today</div></div>
    <div class="stat"><div class="stat-label">Misleading</div><div class="stat-value v-misleading" data-stat="MISLEADING">{{MISLEADING}}</div><div class="stat-foot">verified today</div></div>
    <div class="stat"><div class="stat-label">Unverifiable</div><div class="stat-value v-unverified" data-stat="UNVERIFIABLE">{{UNVERIFIABLE}}</div><div class="stat-foot">verified today</div></div>
  </section>

  <div class="layout">
    <section class="section" aria-label="Today's social card">
      <div class="section-head">
        <div class="section-title">Today's card</div>
        <div class="section-actions">
          <button class="btn btn-ghost" type="button" id="copy-card-btn">Copy text</button>
        </div>
      </div>
      <div class="section-body card-wrap">{{CARD_OR_EMPTY}}</div>
    </section>

    <section class="section" aria-label="Recent verified claims">
      <div class="section-head">
        <div class="section-title">Verified claims</div>
        <div class="section-actions">
          <input class="search" id="search" type="search" placeholder="Search claims" aria-label="Search claims">
        </div>
      </div>
      <div class="section-body">
        <div class="filter-row" id="filter-row" role="tablist" aria-label="Filter by verdict">
          <button class="chip" data-filter="ALL" aria-pressed="true" type="button">All <span class="chip-count">{{TOTAL}}</span></button>
          <button class="chip" data-filter="FALSE" aria-pressed="false" type="button">False <span class="chip-count" data-count="FALSE">{{FALSE}}</span></button>
          <button class="chip" data-filter="MISLEADING" aria-pressed="false" type="button">Misleading <span class="chip-count" data-count="MISLEADING">{{MISLEADING}}</span></button>
          <button class="chip" data-filter="TRUE" aria-pressed="false" type="button">True <span class="chip-count" data-count="TRUE">{{TRUE}}</span></button>
          <button class="chip" data-filter="UNVERIFIABLE" aria-pressed="false" type="button">Unverifiable <span class="chip-count" data-count="UNVERIFIABLE">{{UNVERIFIABLE}}</span></button>
        </div>
        <div style="height:12px"></div>
        <div class="feed" id="feed">
          {{CLAIMS_OR_EMPTY}}
        </div>
      </div>
    </section>
  </div>

  <footer class="footer">
    <span>Built in Rawalpindi · powered by the <a href="https://telegraphprotocol.com" rel="noopener">Telegraph protocol</a> · AI pair-programmed with Command Code</span>
    <span><a href="https://github.com/COSMICnoob80/rxtruth">github.com/COSMICnoob80/rxtruth</a></span>
  </footer>

</div>
<script>
(function () {
  // ── Filter chips + search ─────────────────────────────────────────
  const feed = document.getElementById('feed');
  const search = document.getElementById('search');
  const chips = document.querySelectorAll('.chip');
  let activeFilter = 'ALL';
  let activeQuery = '';

  function applyFilter() {
    const items = feed.querySelectorAll('.claim');
    let visible = 0;
    items.forEach((el) => {
      const verdict = el.getAttribute('data-v') || '';
      const text = (el.getAttribute('data-text') || '').toLowerCase();
      const okV = activeFilter === 'ALL' || verdict === activeFilter;
      const okQ = !activeQuery || text.includes(activeQuery);
      const show = okV && okQ;
      el.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    let empty = feed.querySelector('.feed-empty');
    if (visible === 0) {
      if (!empty) {
        empty = document.createElement('div');
        empty.className = 'claim-empty feed-empty';
        feed.appendChild(empty);
      }
      empty.textContent = activeQuery
        ? 'No claims match the search and filter.'
        : 'No claims match this filter.';
    } else if (empty) {
      empty.remove();
    }
  }

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'));
      activeFilter = chip.getAttribute('data-filter') || 'ALL';
      applyFilter();
    });
  });
  if (search) {
    let t = null;
    search.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => { activeQuery = (search.value || '').toLowerCase().trim(); applyFilter(); }, 120);
    });
  }

  // ── Interactive claim check ───────────────────────────────────────
  const form = document.getElementById('check-form');
  const input = document.getElementById('check-input');
  const submit = document.getElementById('check-submit');
  const result = document.getElementById('check-result');

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = (input.value || '').trim();
    if (text.length < 10) return;
    submit.disabled = true;
    submit.textContent = 'Verifying…';
    result.innerHTML = '<div class="claim-empty">Querying 3 Telegraph Miners (3-12s, paid in USDC)…</div>';
    try {
      const started = Date.now();
      const r = await fetch('/api/claims/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim: text }),
      });
      const j = await r.json();
      const elapsed = ((Date.now() - started) / 1000).toFixed(1);
      if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));

      const conf = Math.round((j.confidence || 0) * 100);
      const txs = (j.txHashes || []).length;
      const aiTag = j.aiSpam ? (j.aiSpam.isAi ? '· likely AI-written' : '· human-written') : '';
      const fc = j.factCheck ? j.factCheck.answer : '';
      result.innerHTML =
        '<div class="claim" data-v="' + esc(j.verdict) + '" style="margin-top:8px">' +
          '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">' +
            '<span class="pill" data-v="' + esc(j.verdict) + '">' + esc(j.verdict) + ' · ' + conf + '%</span>' +
            '<span class="tx-pill">' + txs + ' on-chain proof' + (txs === 1 ? '' : 's') + '</span>' +
            '<span style="font-size:11px;color:var(--ink-faint)">' + elapsed + 's · ' + esc(aiTag) + '</span>' +
          '</div>' +
          '<div class="claim-text">' + esc(text) + '</div>' +
          '<div class="claim-meta">' +
            '<span style="font-style:italic">' + esc(j.reasoning || '') + '</span>' +
          '</div>' +
          (fc ? '<div class="claim-meta"><span class="tx-pill">FACT_CHECK: ' + esc(fc) + '</span></div>' : '') +
        '</div>';
    } catch (err) {
      result.innerHTML = '<div class="claim-empty" style="color:var(--false)">Verification failed: ' + esc(err.message) + '</div>';
    } finally {
      submit.disabled = false;
      submit.textContent = 'Verify claim';
    }
  });

  // ── Run now ────────────────────────────────────────────────────────
  const runBtn = document.getElementById('run-btn');
  if (runBtn) {
    runBtn.addEventListener('click', async () => {
      runBtn.disabled = true;
      const original = runBtn.textContent;
      runBtn.textContent = 'Running…';
      try {
        await fetch('/api/run', { method: 'POST' });
        runBtn.textContent = 'Started, refreshing in 30s…';
        setTimeout(() => location.reload(), 30000);
      } catch (e) {
        runBtn.textContent = 'Failed — try again';
        setTimeout(() => { runBtn.disabled = false; runBtn.textContent = original; }, 4000);
      }
    });
  }

  // ── Copy card text ─────────────────────────────────────────────────
  const copyBtn = document.getElementById('copy-card-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        const r = await fetch('/api/index/today');
        const j = await r.json();
        const idx = j.index;
        const lines = [
          'RxTruth · ' + idx.date,
          '',
          (idx.verdictCounts.FALSE || 0) + ' false, ' + (idx.verdictCounts.MISLEADING || 0) + ' misleading, ' + (idx.verdictCounts.TRUE || 0) + ' true',
          'Built on @Telegraphprotoc · paid per inference via x402',
          'github.com/COSMICnoob80/rxtruth',
        ];
        await navigator.clipboard.writeText(lines.join('\\n'));
        copyBtn.textContent = 'Copied';
        setTimeout(() => { copyBtn.textContent = 'Copy text'; }, 2000);
      } catch (e) {
        copyBtn.textContent = 'Copy failed';
        setTimeout(() => { copyBtn.textContent = 'Copy text'; }, 2000);
      }
    });
  }
})();
</script>
</body>
</html>`;

app.get('/', async (_req, res) => {
  const idx = getIndexByDate(pktDate());
  const claims = getClaimsSince(new Date(Date.now() - 7 * 24 * 3600_000).toISOString()).slice(-50);

  const v = idx?.verdictCounts ?? { TRUE: 0, FALSE: 0, MISLEADING: 0, UNVERIFIABLE: 0 };
  const stats = { TRUE: v.TRUE, FALSE: v.FALSE, MISLEADING: v.MISLEADING, UNVERIFIABLE: v.UNVERIFIABLE };
  const total = stats.TRUE + stats.FALSE + stats.MISLEADING + stats.UNVERIFIABLE;

  const cardSection = idx
    ? `<div class="card-wrap">${renderIndexCard(idx)}</div>`
    : `<div style="padding:48px 20px;color:var(--ink-faint);text-align:center"><div style="color:var(--ink-dim);font-size:15px;margin-bottom:6px">No index yet for today</div><div>Use "Run now" to trigger a verification cycle.</div></div>`;

  const claimsSection = claims.length === 0
    ? `<div class="claim-empty">No claims verified yet. Use the "Check a claim" box above, or click "Run now".</div>`
    : claims
        .map((c) => {
          const verdict = c.verification?.verdict ?? 'UNVERIFIABLE';
          const conf = c.verification?.confidence != null
            ? `${(c.verification.confidence * 100).toFixed(0)}%`
            : '—';
          const txs = c.verification?.txHashes.length ?? 0;
          const src = c.claim.sourceName ?? 'unknown';
          return `<article class="claim" data-v="${verdict}" data-text="${escapeHtml(c.claim.text)}">
            <div class="claim-text">${escapeHtml(c.claim.text)}</div>
            <div class="claim-meta">
              <span class="pill" data-v="${verdict}">${verdict} · ${conf}</span>
              <span>${escapeHtml(src)}</span>
              <span class="tx-pill">${txs} on-chain proof${txs === 1 ? '' : 's'}</span>
            </div>
          </article>`;
        })
        .join('\n');

  const html = DASHBOARD_HTML
    .replace('{{TRUE}}', String(stats.TRUE))
    .replace('{{FALSE}}', String(stats.FALSE))
    .replace('{{MISLEADING}}', String(stats.MISLEADING))
    .replace('{{UNVERIFIABLE}}', String(stats.UNVERIFIABLE))
    .replace('{{TOTAL}}', String(total))
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
