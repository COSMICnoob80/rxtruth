// One-shot pipeline run — no server, no cron.

import { runPipeline } from '../pipeline';
import { buildDailyIndex, renderIndexCard } from '../cards';
import { postIndexToX } from '../xPoster';
import { initStore, closeStore } from '../store';
import { config } from '../config';

async function main(): Promise<void> {
  // Minimal .env loader (KEY=VALUE lines, no quotes handling needed)
  try {
    const { readFileSync } = await import('node:fs');
    const env = readFileSync('.env', 'utf8');
    for (const line of env.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    // no .env — rely on real env vars
  }

  initStore();
  console.log(`[run-once] telegraph=${config.telegraphBaseUrl} network=${config.solanaNetwork}`);

  const summary = await runPipeline();
  const idx = await buildDailyIndex();
  const svg = renderIndexCard(idx);
  const posted = await postIndexToX(idx, svg);

  console.log('\n=== RxTruth run summary ===');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nDaily index ${idx.date}: ${idx.totalClaims} claims, verdicts:`, idx.verdictCounts);
  console.log(`X posted: ${posted}`);
  closeStore();
}

main().catch((err) => {
  console.error('[run-once] fatal:', err);
  process.exit(1);
});
