# RxTruth 🩺⛓️ — Medical Misinformation Radar

**Telegraph Hackathon · Track 3 (Applications) · Aug 31 – Sep 7, 2026**

RxTruth is an autonomous agent that hunts viral health claims in live news, verifies them with
physician-grade reasoning, and publishes a daily **Health Misinformation Index** — where every
verdict carries the **on-chain transaction hash** of the AI inference that produced it.

Built by a doctor (MBBS), powered by the [Telegraph](https://telegraphprotocol.com) intelligence
layer, paid per-inference via [x402](https://x402.org) micropayments on Solana devnet.

## How it works

```
DeSearch (subnet 101)          Groq LLM (subnet 102)         ItsAI (subnet 32)
news harvest ──→ claim extraction ──→ medical verification ──→ AI-spam check
     │                  │                    │                      │
     └──────────────────┴────────────────────┴──────────────────────┘
                              │  every call = x402 tx proof
                              ▼
              SQLite store ──→ Daily Health Misinformation Index
                              ├── SVG debunk card (X-ready)
                              ├── dashboard (GET /)
                              └── optional auto-post to X
```

## Intents fused (7)

`NEWS_SEARCH` · `CONTENT_EXTRACTION` · `CHAT_COMPLETION` · `FACT_CHECK` ·
`RESEARCH_SYNTHESIS` · `SENTIMENT_ANALYSIS` · `AI_TEXT_DETECTION`

## Quickstart

```bash
npm install
cp .env.example .env          # add SOLANA_PRIVATE_KEY (devnet USDC-funded)
npm run run:once              # one full pipeline run against the live engine
npm run dev                   # server + cron: dashboard on http://localhost:3001
```

## API

| Endpoint | Description |
|---|---|
| `GET /` | Dashboard — today's index + recent verified claims |
| `GET /api/health` | Liveness + config |
| `GET /api/claims?hours=24` | Verified claims JSON |
| `GET /api/index/today` | Daily index + SVG card |
| `POST /api/run` | Trigger pipeline (header: `x-run-token`) |

## Docs

- [ROADMAP.md](./ROADMAP.md) — the road to submission (Phase A prep / Phase B build window)

## License

MIT
