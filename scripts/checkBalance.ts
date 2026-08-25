// Dev utility: derive the wallet pubkey from .env SOLANA_PRIVATE_KEY and
// print devnet balances (SOL + USDC spl-token).
import '../src/loadEnv';
import { base58 } from '@scure/base';
import { publicKeyFromRaw } from '../src/payments/keypair';

async function main(): Promise<void> {
  const key = (process.env.SOLANA_PRIVATE_KEY ?? '').trim();
  if (!key) {
    console.error('SOLANA_PRIVATE_KEY not set');
    process.exit(1);
  }
  const raw = base58.decode(key);
  const pubkey = base58.encode(publicKeyFromRaw(raw));
  console.log(`wallet pubkey: ${pubkey}`);

  const rpc = 'https://api.devnet.solana.com';
  const sol = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [pubkey] }),
  });
  const solJson = (await sol.json()) as { result?: { value?: number } };
  console.log(`SOL balance: ${(solJson.result?.value ?? 0) / 1e9} SOL`);

  // Devnet USDC mint
  const usdcMint = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
  const ta = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'getTokenAccountsByOwner',
      params: [pubkey, { mint: usdcMint }, { encoding: 'jsonParsed' }],
    }),
  });
  const taJson = (await ta.json()) as {
    result?: {
      value?: Array<{ account: { data: { parsed: { info: { tokenAmount: { uiAmount: number | null } } } } } }>;
    };
  };
  const accounts = taJson.result?.value ?? [];
  if (accounts.length === 0) {
    console.log('USDC balance: no token accounts (0 USDC)');
  } else {
    for (const a of accounts) {
      console.log(`USDC balance: ${a.account.data.parsed.info.tokenAmount.uiAmount} USDC`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
