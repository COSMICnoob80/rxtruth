// Dev utility: request devnet SOL airdrop for the .env wallet.
import '../src/loadEnv';
import { base58 } from '@scure/base';
import { publicKeyFromRaw } from '../src/payments/keypair';

async function main(): Promise<void> {
  const key = (process.env.SOLANA_PRIVATE_KEY ?? '').trim();
  const pubkey = base58.encode(publicKeyFromRaw(base58.decode(key)));
  console.log(`airdrop target: ${pubkey}`);

  const rpc = 'https://api.devnet.solana.com';
  const res = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'requestAirdrop',
      params: [pubkey, 2_000_000_000], // 2 SOL
    }),
  });
  const json = (await res.json()) as { result?: string; error?: { message?: string } };
  if (json.error) {
    console.error(`airdrop failed: ${json.error.message}`);
    process.exit(1);
  }
  console.log(`airdrop tx: ${json.result}`);

  const bal = await fetch(rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'getBalance', params: [pubkey] }),
  });
  const balJson = (await bal.json()) as { result?: { value?: number } };
  console.log(`SOL balance now: ${(balJson.result?.value ?? 0) / 1e9} SOL`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
