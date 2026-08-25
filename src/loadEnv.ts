// Loads .env into process.env at import time.
// Must be the FIRST import in any entrypoint, before ./config evaluates.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

try {
  const raw = readFileSync(join(process.cwd(), '.env'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
} catch {
  // no .env file — rely on real environment variables
}
