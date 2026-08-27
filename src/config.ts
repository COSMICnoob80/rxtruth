const num = (raw: string | undefined, fallback: number): number => {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const list = (raw: string | undefined, fallback: string[]): string[] => {
  if (!raw) return fallback;
  const parsed = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : fallback;
};

export const config = {
  port: num(process.env.PORT, 3001),
  runToken: process.env.RUN_TOKEN ?? '',

  telegraphBaseUrl: process.env.TELEGRAPH_BASE_URL ?? 'http://13.237.89.59:7044',
  deSearchPath: process.env.DESEARCH_PATH ?? '/engine/v1/ask/202',
  groqPath: process.env.GROQ_PATH ?? '/engine/v1/ask/901',
  itsaiPath: process.env.ITSAI_PATH ?? '/engine/v1/ask/32',
  groqModel: process.env.GROQ_MODEL ?? 'groq/llama-3.1-8b-instant',

  solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY ?? '',
  solanaNetwork: (process.env.SOLANA_NETWORK ?? 'devnet') as 'devnet' | 'mainnet',

  cronSchedule: process.env.CRON_SCHEDULE ?? '0 */6 * * *',
  maxClaimsPerRun: num(process.env.MAX_CLAIMS_PER_RUN, 8),
  harvestQueries: list(process.env.HARVEST_QUERIES, [
    'viral health claim',
    'miracle cure warning',
    'health misinformation trend',
    'dangerous home remedy',
    'viral medical advice',
  ]),

  x: {
    appKey: process.env.X_APP_KEY ?? '',
    appSecret: process.env.X_APP_KEY ? process.env.X_APP_SECRET ?? '' : '',
    accessToken: process.env.X_APP_KEY ? process.env.X_ACCESS_TOKEN ?? '' : '',
    accessSecret: process.env.X_APP_KEY ? process.env.X_ACCESS_SECRET ?? '' : '',
  },
};

export type Config = typeof config;
