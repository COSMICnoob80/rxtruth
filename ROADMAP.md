# RxTruth — Road to the Telegraph Hackathon

**Track 3 (Applications) · Aug 31 – Sep 7 · winners Sep 19–25**
Repo: https://github.com/COSMICnoob80/rxtruth

## The one-liner

> RxTruth is an autonomous medical misinformation radar: it harvests viral health claims from
> live news via Telegraph Miners, verifies them with physician-grade LLM prompts + AI-spam
> detection, and publishes a daily **Health Misinformation Index** where every verdict carries
> on-chain proof of the inference that produced it.

## Phase A — Prep window (now → Aug 31)

Goal: **zero unknowns left before the build window opens.**

- [x] Idea locked, scaffold built, typecheck + build green, repo pushed
- [x] **Fund a Solana devnet wallet** with devnet SOL + USDC (Circle faucet, 20 USDC)
- [x] **Live smoke test**: pipeline runs end-to-end against the real engine
      (`http://13.237.89.59:7044`). Working miner IDs: Tavily 202 (news), Groq 901 (LLM), ItsAI 32 (AI-text detection)
- [x] Confirm `GROQ_MODEL=groq/llama-3.1-8b-instant` is live (the old `groq/compound-mini` has rotated)
- [x] Dry-run the dashboard (`npm run dev` → `GET /`) — redesigned, mobile-friendly
- [x] First live daily Index generated with 3 FALSE / 2 MISLEADING / 3 UNVERIFIABLE verdicts
- [ ] Join Discord, post intro, watch for engine/endpoint changes before Sep 7
- [ ] X app keys (developer.x.com free tier) → `.env` for auto-posting
- [ ] Update registration: GitHub repo link on the hackathon site (click Register again)

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
