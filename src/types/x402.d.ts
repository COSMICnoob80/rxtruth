// Type shims for ESM-only x402 packages (moduleResolution: node cannot
// resolve their .d.mts files). Same approach as telegraph-supersignal.

declare module '@x402/fetch' {
  export class x402Client {
    registerScheme(scheme: unknown): void;
  }
  export function wrapFetchWithPayment(
    fetch: typeof fetch,
    client: x402Client
  ): typeof fetch;
}

declare module '@x402/svm/exact/client' {
  export function registerExactSvmScheme(
    client: unknown,
    options: { signer: unknown }
  ): void;
}
