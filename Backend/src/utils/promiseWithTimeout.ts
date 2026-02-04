import { ApiError } from './ApiError';

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message = 'Request timeout'
): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new ApiError(504, message)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId!));
}
