import { isAxiosError } from 'axios';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function isRetryableTelegramVerifyError(err: unknown): boolean {
  if (!isAxiosError(err)) return false;
  if (!err.response) return true;
  const status = err.response.status;
  return status >= 500 || status === 408 || status === 429;
}

export async function withTelegramVerifyRetries<T>(run: () => Promise<T>): Promise<T> {
  const attempts = 3;
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await run();
    } catch (err) {
      lastError = err;
      if (i === attempts - 1 || !isRetryableTelegramVerifyError(err)) {
        throw err;
      }
      await sleep(400 * (i + 1));
    }
  }
  throw lastError;
}
