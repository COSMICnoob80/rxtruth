# RxTruth — Roadmap to submission

**Hackathon window**: the app-building phase opens Aug 31 and closes Sep 7, 2026.
**Winners announced**: Sep 19 – 25.

---

## What is done already

- [x] The app idea is locked: a medical misinformation radar that verifies viral health
      claims using four different AI services and posts a daily card people can share.
- [x] The code is written, builds clean, and is pushed to GitHub at
      `github.com/COSMICnoob80/rxtruth`.
- [x] A first end-to-end test ran against the live engine. Real AI services were called,
      real payments were made in test-network money, and real transaction hashes came back.
- [x] The wallet that pays for AI calls is funded with 2 SOL and ~18 USDC (test-network
      money, free from the faucets). About 19 days of daily use.
- [x] The dashboard works. You can paste any health claim into a box, press a button, and
      see a verdict in 3 to 12 seconds.
- [x] A 1200 by 630 pixel share card is auto-generated every day, ready to post on X.
- [x] A brand mark (logo) and three social-media share images are saved in `assets/brand/`.
- [x] The README is rewritten in plain English for both judges and non-technical readers.

---

## What to do each day

### Today (Aug 30)

1. **Update the hackathon site**: click "Register" again on the Telegraphprotocol.com
   hackathon page and paste the GitHub repo URL
   `github.com/COSMICnoob80/rxtruth` so the judges see the latest code.
2. **Create a free X (Twitter) developer app** at <https://developer.x.com> if you want
   the app to post the daily card automatically. The free tier is enough. You need four
   keys: an API key, an API secret, an access token, an access secret. Put them in
   `.env` under the four `X_*` variables.
3. **Post an intro in the Telegraph Discord** in the #hackathon channel. The CTO,
   Ahmed, already complimented the idea. A short note saying "my Track 3 entry is
   building, repo is here, X card is here" goes a long way.
4. **Run the live pipeline once more** (`npm run run:once`) so the database has fresh
   claims for the judges to look at on Aug 31.

### Aug 31 (Track 3 opens)

1. **Run the agent** (`npm run dev`) and let the cron run for 6 hours.
2. **Tune the search queries** in `.env` (`HARVEST_QUERIES`). The first run will
   show you which queries surface the most viral health claims and which return junk.
3. **Screenshot the dashboard and one debunk card.** These are your demo materials.

### Sep 1 – Sep 2

1. **Post the first daily Index on X** (manually if the auto-post is not set up, or
   automatically if the X keys are in `.env`). The card and a 280-character caption
   are generated for you.
2. **Reply to a few other Track 1 and Track 2 builders on X** who are posting updates.
   Hackathon judging rewards builders who engage with each other.
3. **Post a "Day 1 of building RxTruth" update** with one screenshot and one tx hash
   (the dashboard shows them — copy a few).

### Sep 3 – Sep 5

1. **Watch for issues**. The four AI services can rotate or go down. The pipeline has
   retries, but if a service is down for hours, swap to a different one (the
   `src/clients/*.ts` files are small and easy to update).
2. **Add more cards to the daily feed** by tuning the harvest queries. If you are
   seeing too few claims, broaden the queries. If you are seeing too much noise,
   narrow them.
3. **Check the database** occasionally: `sqlite3 data/rxtruth.db 'SELECT COUNT(*),
   json_extract(verification_json, "$.verdict") FROM claims GROUP BY 2;'`. If
   verdicts are skewed (for example, every claim is "UNVERIFIABLE"), the Groq prompt
   in `src/pipeline.ts` probably needs tuning.

### Sep 6

1. **Record a 60-second demo video** showing: paste a claim into the dashboard, watch
   the verdict come back, click through to the transaction hash on the Solana devnet
   explorer.
2. **Polish the submission writeup** — the README is already there, but the hackathon
   form may ask for a short project description and a one-line pitch.

### Sep 7 (final day)

1. **Submit** before the deadline.
2. **Leave the agent running** so the judges can see the dashboard with live data.

---

## What to do if something breaks

- **"Payment failed"**: the wallet is out of USDC. Top up at
  <https://faucet.circle.com> (asset USDC, network Solana Devnet).
- **"404 endpoint not declared"**: the Telegraph engine has rotated a miner. Check
  the `#hackathon` Discord channel for the announcement, then run
  `curl -s http://13.237.89.59:7044/engine/v1/subnets | jq .` to see the current
  miner list, and update `src/config.ts` and `.env` accordingly.
- **"No claims harvested"**: the search queries are returning nothing. Broaden them
  in `.env` (`HARVEST_QUERIES`).
- **"Dashboard is empty"**: the daily index has not been built today. Either click
  "Run now" on the dashboard, or wait for the next 6-hour cron tick.

---

## What not to do

- Do not invent or simulate data. Every claim in the database must come from a real
  AI service call that you can prove with a transaction hash. The rules page says
  simulated data is disqualifying.
- Do not add more than the 5 to 8 claims you are already verifying per run. Each one
  costs about $0.03, and the wallet has a limited balance.
- Do not switch to a different hackathon theme mid-build. The medical fact-checking
  angle is the only thing that is hard for other builders to copy.

---

## The one line that matters

> Every verdict in the database has a real Solana transaction hash proving the AI
> service was actually called and paid. That is the part the judges care about.
