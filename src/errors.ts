export class UpstreamError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 502
  ) {
    super(message);
  }
}

export function formatFetchError(error: unknown): string {
  if (error instanceof Error) {
    return error.name === 'AbortError' ? 'request timed out' : error.message;
  }
  return String(error);
}
