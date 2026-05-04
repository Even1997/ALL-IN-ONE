export type RetryOptions = {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: number;
  retryableStatuses?: Set<number>;
  onRetry?: (attempt: number, error: Error, delay: number) => void;
  signal?: AbortSignal;
};

const DEFAULT_RETRYABLE_STATUSES = new Set([408, 409, 429, 500, 502, 503, 504]);
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BASE_DELAY = 500;
const DEFAULT_MAX_DELAY = 32000;
const DEFAULT_JITTER = 0.25;

const isRetryableError = (error: Error, retryableStatuses: Set<number>): boolean => {
  const message = error.message.toLowerCase();

  // HTTP status codes
  for (const status of retryableStatuses) {
    if (message.includes(String(status))) {
      return true;
    }
  }

  // Connection-level errors
  if (
    message.includes('econnreset') ||
    message.includes('epipe') ||
    message.includes('etimedout') ||
    message.includes('enotfound') ||
    message.includes('econnrefused') ||
    message.includes('network') ||
    message.includes('fetch failed') ||
    message.includes('abort')
  ) {
    return true;
  }

  return false;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY;
  const jitter = options.jitter ?? DEFAULT_JITTER;
  const retryableStatuses = options.retryableStatuses ?? DEFAULT_RETRYABLE_STATUSES;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      if (options.signal?.aborted) {
        throw new Error('Aborted');
      }
      const result = await fn();
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (options.signal?.aborted) {
        throw lastError;
      }

      if (attempt === maxRetries || !isRetryableError(lastError, retryableStatuses)) {
        throw lastError;
      }

      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt) + Math.random() * jitter * baseDelayMs * Math.pow(2, attempt),
        maxDelayMs
      );

      options.onRetry?.(attempt + 1, lastError, Math.round(delay));
      await sleep(delay);
    }
  }

  throw lastError ?? new Error('withRetry exhausted');
}
