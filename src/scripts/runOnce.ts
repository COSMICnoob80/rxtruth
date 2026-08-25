// One-shot pipeline run — no server, no cron.
import '../loadEnv'; // FIRST import — populates process.env from .env

import { runPipeline } from '../pipeline';
import { buildDailyIndex, renderIndexCard } from '../cards';
import { postIndexToX } from '../xPoster';
import { initStore, closeStore } from '../store';
import { config } from '../config';

async function main(): Promise<void> {
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
