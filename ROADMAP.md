# RxTruth — Road to the Telegraph Hackathon

**Track 3 (Applications) · Aug 31 – Sep 7 · winners Sep 19–25**
Repo: https://github.com/COSMICnoob80/rxtruth

## The one-liner

> RxTruth is an autonomous medical misinformation radar: it harvests viral health claims from
> live news via Telegraph Miners, verifies them with physician-grade LLM prompts + AI-spam
> detection, and publishes a daily **Health Misinformation Index** where every verdict carries
> on-chain proof of the inference that produced it.

## Why this wins (the judge story)

1. **Only doctor-built entry in a 1000+ builder pool** — the verification prompts are written
   with real clinical judgment; nobody can copy that.
2. **Multi-intent fusion (7 intents)** — the rules page explicitly rewards cross-domain
   intelligence: NEWS_SEARCH + CONTENT_EXTRACTION + AI_TEXT_DETECTION + FACT_CHECK +
   RESEARCH_SYNTHESIS + SENTIMENT_ANALYSIS + CHAT_COMPLETION.
3. **Real Miners, zero mocking** — every verdict embeds the x402 transaction hash of the
   inference that produced it (rule #1 compliance as a feature).
4. **The 25% X criterion is native** — the product *is* a daily X-postable debunk card.

## Phase A — Prep window (now → Aug 31)

Goal: **zero unknowns left before the build window opens.**

- [x] Idea locked, scaffold built, typecheck + build green, repo pushed
- [ ] **Fund a Solana devnet wallet** with devnet USDC; put key in `.env` (`SOLANA_PRIVATE_KEY`)
- [ ] **Live smoke test**: `npm run run:once` — one full pipeline against the real engine
      (`http://13.237.89.59:7044`). Fix whatever breaks (payload shapes, model names).
- [ ] Confirm `GROQ_MODEL` name in the Telegraph Discord (#hackathon) — model names drift
- [ ] Join Discord, post intro, watch for engine/endpoint changes before Sep 7
- [ ] X app keys (developer.x.com free tier) → `.env` for auto-posting
- [ ] Update registration: GitHub repo link on the hackathon site (click Register again)
- [ ] Dry-run the dashboard (`npm run dev` → `GET /`) and card rendering with real data

## Phase B — Build window (Aug 31 → Sep 7)

Track 3 officially opens Aug 31. Daily rhythm:

- **Aug 31 – Sep 1**: Live end-to-end runs. Tune harvest queries for claim density.
- **Sep 2 – 3**: First daily Index posts to X (tag @Telegraphprotoc). Dashboard polish.
- **Sep 4 – 5**: Reliability: retries, partial-failure handling, spend cap per run.
- **Sep 6**: Record demo (dashboard + card + tx proof explorer view). Write submission README.
- **Sep 7**: Final submission. Keep the agent running until winners are announced.

## X posting cadence (the 25%)

- 1 daily Index card post (auto-generated SVG + stats)
- 2-3 builder-log posts: "Day N of building RxTruth — today the miner flagged …" with tx proofs
- Engage: reply to @Telegraphprotoc posts, other builders' Track 1/2 updates

## Standing rules (from the official rules page)

- Real Miners only — simulated data = disqualification (we're compliant by design)
- Stay in the Discord — that's where engine changes land
- All judged updates must be public on X and tagged
- No metric inflation — our tx hashes are self-verifying honesty
