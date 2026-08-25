// Ed25519 keypair derivation from a 32-byte seed or 64-byte keypair.
// Uses node:crypto with the standard Ed25519 PKCS#8 DER wrapper — WebCrypto's
// importKey('raw') only accepts PUBLIC keys for Ed25519, so it cannot be used
// to derive a keypair from a seed.

import { createPrivateKey, createPublicKey } from 'node:crypto';
import type { KeyObject } from 'node:crypto';

// PKCS#8 DER prefix for a 32-byte Ed25519 private key (RFC 8410)
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

function privateKeyObjectFromSeed(seed: Buffer): KeyObject {
  const pkcs8 = Buffer.concat([ED25519_PKCS8_PREFIX, seed]);
  return createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
}

/**
 * Accepts a 32-byte secret seed or a 64-byte secret keypair
 * (seed || public) and returns the full 64-byte keypair.
 */
export function deriveKeypairBytes(raw: Uint8Array): Uint8Array {
  if (raw.length === 64) return raw;
  if (raw.length !== 32) {
    throw new Error(`expected 32-byte seed or 64-byte keypair, got ${raw.length} bytes`);
  }
  const seed = Buffer.from(raw);
  const priv = privateKeyObjectFromSeed(seed);
  const spki = createPublicKey(priv).export({ type: 'spki', format: 'der' }) as Buffer;
  const pub = spki.subarray(spki.length - 32);
  const out = new Uint8Array(64);
  out.set(seed, 0);
  out.set(pub, 32);
  return out;
}

/** Derives the base58 public key for a seed or keypair. */
export function publicKeyFromRaw(raw: Uint8Array): Uint8Array {
  if (raw.length === 64) return raw.slice(32);
  const seed = Buffer.from(raw);
  const priv = privateKeyObjectFromSeed(seed);
  const spki = createPublicKey(priv).export({ type: 'spki', format: 'der' }) as Buffer;
  return new Uint8Array(spki.subarray(spki.length - 32));
}
