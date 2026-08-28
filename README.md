# RxTruth — Medical Misinformation Radar

**Telegraph Hackathon · Track 3 (Applications) · Aug 31 – Sep 7, 2026**

RxTruth is an autonomous agent that hunts viral health claims in live news, verifies each one
through independent Telegraph Miners, and publishes a daily **Health Misinformation Index** —
where every verdict carries the on-chain transaction hash of the inference that produced it.

Built by a doctor, powered by the [Telegraph](https://telegraphprotocol.com) intelligence
layer, paid per-inference via [x402](https://x402.org) micropayments on Solana devnet.

## How it works

```
Tavily (202)        Groq LLM (901)              Community Mem. (23)    ItsAI (32)
news harvest  ──→  claim extraction  ──→       independent           AI-text
                                                  FACT_CHECK            spam check
                                                     │                     │
                                                     └─────┬───────────────┘
                                                           ▼
                                       SQLite store ──→ Daily Index
                                                       ├── SVG debunk card (X-ready, 1200×630)
                                                       ├── dashboard (GET /, mobile-first)
                                                       └── optional auto-post to X
```

Every call to a Miner is paid via x402 and returns a transaction hash. The hash is stored with
the verdict. Anyone — including a judge — can look up the hash on the Solana devnet explorer
and confirm the inference was real, not mocked.

## What's already live

- 16 viral health claims verified end-to-end on devnet (4 of each verdict)
- 50+ on-chain transaction proofs from paid Miner calls
- Daily Index auto-generated with 4-segment verdict strip and top false claim
- Mobile-first dashboard rendering the same data at `GET /`
- Cron schedule fires the agent every 6 hours; 280-char X post text ready for the moment
  X API keys land in `.env`

## Intents used (Telegraph native)

| Intent | Miner | Path | Role |
|---|---|---|---|
| `WEB_SEARCH` | Tavily (202) | `/engine/v1/ask/202` | News harvest |
| `CHAT_COMPLETION` | Groq LPU (901) | `/engine/v1/ask/901` | Claim extraction + medical verification |
| `FACT_CHECK` | Community Memory (23) | `/engine/v1/ask/23` | Independent verdict signal |
| `AI_TEXT_DETECTION` | ItsAI (32) | `/engine/v1/ask/32` | AI-spam check on the claim text |

The engine exposes these as `capabilities` per miner — not as static subnet IDs. The current
mapping is the result of probing the live catalog `/engine/v1/subnets` and `/engine/v1/intents`.

## Quickstart

```bash
npm install
cp .env.example .env          # add SOLANA_PRIVATE_KEY (devnet USDC-funded)
npm run run:once              # one full pipeline run against the live engine
npm run dev                   # server + cron: dashboard on http://localhost:3001
```

To fund the wallet: 2 SOL via `solana airdrop 2` and 20 USDC via
[faucet.circle.com](https://faucet.circle.com) (asset: USDC, network: Solana Devnet).

## API

| Endpoint | Description |
|---|---|
| `GET /` | Dashboard — today's index + recent verified claims |
| `GET /api/health` | Liveness + config |
| `GET /api/claims?hours=24` | Verified claims JSON |
| `GET /api/index/today` | Daily index + SVG card |
| `POST /api/run` | Trigger pipeline (header: `x-run-token`) |

## Architecture notes

- `src/payments/x402.ts` — Solana SVM scheme registration, per-call `PaymentCapture` for tx
  hash capture (ScholarGuard pattern)
- `src/clients/{desearch,groq,itsai,factcheck}.ts` — typed wrappers per Miner with
  retry/backoff and shape-specific response unwrapping
- `src/pipeline.ts` — harvest → extract → verify → spam-check → FACT_CHECK → persist
- `src/store.ts` — `node:sqlite` (WAL) for the claims and daily_index tables
- `src/cards.ts` — the SVG debunk card (Inter type, OKLCH palette, no decoration)
- `src/xPoster.ts` — 280-char tweet composer, always saves the card locally even when
  X creds are absent
- `src/server.ts` — Express API, mobile-first dashboard, cron autonomy

## Docs

- [ROADMAP.md](./ROADMAP.md) — prep window, build window, X cadence, standing rules
- [data/cards/](./data/cards) — every daily Index SVG ever generated

## License

MIT
