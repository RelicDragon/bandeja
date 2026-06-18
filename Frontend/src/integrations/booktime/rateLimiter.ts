/**
 * Rate limiting and retry logic for Booktime API requests.
 * Handles per-club request queuing, exponential backoff, and rate limit detection.
 */

export type BooktimeRateLimitConfig = {
  /** Maximum requests per minute (default: 60) */
  requestsPerMinute?: number;
  /** Maximum concurrent requests (default: 3) */
  maxConcurrent?: number;
  /** Base retry delay in ms (default: 1000) */
  baseRetryDelayMs?: number;
  /** Maximum retry delay in ms (default: 30000) */
  maxRetryDelayMs?: number;
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Whether rate limiting is enabled for this club (default: true) */
  enabled?: boolean;
};

export const DEFAULT_RATE_LIMIT_CONFIG: Required<BooktimeRateLimitConfig> = {
  requestsPerMinute: 60,
  maxConcurrent: 3,
  baseRetryDelayMs: 1000,
  maxRetryDelayMs: 30000,
  maxRetries: 3,
  enabled: true,
};

type QueuedRequest = {
  execute: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  retryCount: number;
  lastError?: unknown;
};

type ClubRateLimitState = {
  config: BooktimeRateLimitConfig;
  activeRequests: number;
  queue: QueuedRequest[];
  requestTimestamps: number[];
  rateLimitBackoffUntil?: number;
  last429Timestamp?: number;
};

const clubStates = new Map<string, ClubRateLimitState>();

function getClubState(clubId: string, config: BooktimeRateLimitConfig = {}): ClubRateLimitState {
  let state = clubStates.get(clubId);
  if (!state) {
    state = {
      config: { ...DEFAULT_RATE_LIMIT_CONFIG, ...config },
      activeRequests: 0,
      queue: [],
      requestTimestamps: [],
    };
    clubStates.set(clubId, state);
  }
  return state;
}

function calculateExponentialBackoff(
  retryCount: number,
  baseDelay: number,
  maxDelay: number
): number {
  const exponentialDelay = baseDelay * Math.pow(2, retryCount);
  // Add jitter (±25%)
  const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
  return Math.min(maxDelay, exponentialDelay + jitter);
}

function cleanOldRequestTimestamps(timestamps: number[], windowMs: number): number[] {
  const now = Date.now();
  const cutoff = now - windowMs;
  return timestamps.filter((ts) => ts > cutoff);
}

function canMakeRequest(state: ClubRateLimitState): boolean {
  if (!state.config.enabled) return true;

  const now = Date.now();

  // Check if we're in a backoff period from a previous 429
  if (state.rateLimitBackoffUntil && now < state.rateLimitBackoffUntil) {
    return false;
  }

  // Check concurrent request limit
  if (state.activeRequests >= (state.config.maxConcurrent ?? DEFAULT_RATE_LIMIT_CONFIG.maxConcurrent)) {
    return false;
  }

  // Check rate limit (requests per minute)
  const oneMinuteMs = 60_000;
  state.requestTimestamps = cleanOldRequestTimestamps(state.requestTimestamps, oneMinuteMs);
  const rpmLimit = state.config.requestsPerMinute ?? DEFAULT_RATE_LIMIT_CONFIG.requestsPerMinute;
  return state.requestTimestamps.length < rpmLimit;
}

function handleRateLimitError(state: ClubRateLimitState, status: number): void {
  const now = Date.now();
  state.last429Timestamp = now;

  // Only 429 (rate limit exceeded) should trigger rate limiter backoff
  // 403 is handled by the token refresh layer instead
  if (status !== 429) return;

  // Use exponential backoff based on recent 429s
  const recent429s = state.requestTimestamps.filter(
    (ts) => now - ts < 60_000 && ts >= (state.last429Timestamp ?? 0)
  ).length;
  const backoffMs = calculateExponentialBackoff(
    recent429s,
    state.config.baseRetryDelayMs ?? DEFAULT_RATE_LIMIT_CONFIG.baseRetryDelayMs,
    state.config.maxRetryDelayMs ?? DEFAULT_RATE_LIMIT_CONFIG.maxRetryDelayMs
  );

  state.rateLimitBackoffUntil = now + backoffMs;
}

async function processQueue(clubId: string): Promise<void> {
  const state = clubStates.get(clubId);
  if (!state || state.queue.length === 0) return;

  const next = state.queue[0];
  if (!next) return;

  if (!canMakeRequest(state)) {
    // Schedule retry when we might be able to proceed
    const now = Date.now();
    const backoffUntil = state.rateLimitBackoffUntil ?? now + 1000;
    const delay = Math.max(100, backoffUntil - now);
    setTimeout(() => processQueue(clubId), delay);
    return;
  }

  // Remove from queue
  state.queue.shift();

  // Track the request
  state.activeRequests++;
  const requestTime = Date.now();
  state.requestTimestamps.push(requestTime);

  try {
    const result = await next.execute();
    next.resolve(result);
  } catch (err) {
    const status = err && typeof err === 'object' && 'status' in err ? Number((err as { status: number }).status) : 0;

    // Only handle 429 (rate limit exceeded) in the rate limiter
    // 401/403 are handled by the token refresh layer
    if (status === 429 && next.retryCount < (state.config.maxRetries ?? DEFAULT_RATE_LIMIT_CONFIG.maxRetries)) {
      handleRateLimitError(state, status);

      // Calculate delay for retry
      const retryDelay = calculateExponentialBackoff(
        next.retryCount,
        state.config.baseRetryDelayMs ?? DEFAULT_RATE_LIMIT_CONFIG.baseRetryDelayMs,
        state.config.maxRetryDelayMs ?? DEFAULT_RATE_LIMIT_CONFIG.maxRetryDelayMs
      );

      // Re-queue with incremented retry count
      setTimeout(() => {
        state.queue.push({ ...next, retryCount: next.retryCount + 1 });
        processQueue(clubId);
      }, retryDelay);
    } else {
      next.reject(err);
    }
  } finally {
    state.activeRequests--;
    // Process next item in queue
    void processQueue(clubId);
  }
}

/**
 * Execute a Booktime API request with rate limiting and retry logic.
 * @param clubId - The club ID for per-club rate limiting
 * @param executeFn - Function that executes the actual API request
 * @param config - Optional rate limit configuration for this club
 * @returns Promise that resolves with the request result
 */
export async function rateLimitedRequest<T>(
  clubId: string,
  executeFn: () => Promise<T>,
  config?: BooktimeRateLimitConfig
): Promise<T> {
  const state = getClubState(clubId, config);

  // If rate limiting is disabled, execute directly
  if (!state.config.enabled) {
    return executeFn();
  }

  return new Promise<T>((resolve, reject) => {
    state.queue.push({
      execute: executeFn,
      resolve: resolve as (value: unknown) => void,
      reject,
      retryCount: 0,
    });
    void processQueue(clubId);
  });
}

/**
 * Update the rate limit configuration for a club.
 * @param clubId - The club ID
 * @param config - New rate limit configuration
 */
export function updateRateLimitConfig(clubId: string, config: BooktimeRateLimitConfig): void {
  const state = clubStates.get(clubId);
  if (state) {
    state.config = { ...DEFAULT_RATE_LIMIT_CONFIG, ...config };
  }
}

/**
 * Clear rate limit state for a club (e.g., after disconnecting).
 * @param clubId - The club ID
 */
export function clearRateLimitState(clubId: string): void {
  const state = clubStates.get(clubId);
  if (state) {
    state.queue = [];
    state.activeRequests = 0;
    state.requestTimestamps = [];
    state.rateLimitBackoffUntil = undefined;
  }
}

/**
 * Get current rate limit statistics for a club.
 * @param clubId - The club ID
 * @returns Object with rate limit stats
 */
export function getRateLimitStats(clubId: string): {
  activeRequests: number;
  queuedRequests: number;
  requestsInLastMinute: number;
  backoffUntil?: number;
} | null {
  const state = clubStates.get(clubId);
  if (!state) return null;

  const oneMinuteMs = 60_000;
  state.requestTimestamps = cleanOldRequestTimestamps(state.requestTimestamps, oneMinuteMs);

  return {
    activeRequests: state.activeRequests,
    queuedRequests: state.queue.length,
    requestsInLastMinute: state.requestTimestamps.length,
    backoffUntil: state.rateLimitBackoffUntil,
  };
}

/**
 * Clear all rate limit states (e.g., on logout).
 */
export function clearAllRateLimitStates(): void {
  for (const clubId of clubStates.keys()) {
    clearRateLimitState(clubId);
  }
  clubStates.clear();
}
