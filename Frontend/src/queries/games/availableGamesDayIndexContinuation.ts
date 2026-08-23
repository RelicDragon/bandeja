import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { FindDayIndexRow } from '@/utils/findDayIndexCounts';
import type {
  AvailableGamesDayIndexContinuationStatus,
  AvailableGamesPage,
  AvailableGamesPageMeta,
} from './availableGamesPage';

export const FIND_MONTH_INDEX_METRIC_EVENT = 'bandeja-find-month-index-metric';

export type FindMonthIndexMetric = {
  outcome: Exclude<AvailableGamesDayIndexContinuationStatus, 'pending' | 'loading'>;
  pagesLoaded: number;
  elapsedMs: number;
  mergeMs: number;
  retries: number;
  resumeAttempts: number;
  budgetHit: boolean;
};

export type AvailableGamesDayIndexContinuationConfig = {
  maxContinuationPages: number;
  maxDurationMs: number;
  pageTimeoutMs: number;
  retryDelaysMs: readonly number[];
  now: () => number;
};

type StartContinuationInput = {
  queryClient: QueryClient;
  queryKey: QueryKey;
  page: AvailableGamesPage;
  fetchPage: (
    cursor: string,
    signal: AbortSignal,
    timeoutMs: number,
  ) => Promise<AvailableGamesPageMeta>;
  config?: Partial<AvailableGamesDayIndexContinuationConfig>;
  isResume?: boolean;
};

type ContinuationJob = {
  controller: AbortController;
  done: Promise<void>;
  resolveDone: () => void;
  generation: number;
  finished: boolean;
  startedAt: number;
  now: () => number;
  pagesLoaded: number;
  mergeMs: number;
  retries: number;
};

const DEFAULT_CONFIG: AvailableGamesDayIndexContinuationConfig = {
  maxContinuationPages: 12,
  maxDurationMs: 12_000,
  pageTimeoutMs: 4_000,
  retryDelaysMs: [250, 750],
  now: () => (typeof performance === 'undefined' ? Date.now() : performance.now()),
};

const jobsByClient = new WeakMap<QueryClient, Map<string, ContinuationJob>>();
const ownersByClient = new WeakMap<QueryClient, Map<string, Set<symbol>>>();
const recentMetrics: FindMonthIndexMetric[] = [];
let nextGeneration = 1;

function keyId(queryKey: QueryKey): string {
  return JSON.stringify(queryKey);
}

function jobsFor(queryClient: QueryClient): Map<string, ContinuationJob> {
  let jobs = jobsByClient.get(queryClient);
  if (!jobs) {
    jobs = new Map();
    jobsByClient.set(queryClient, jobs);
  }
  return jobs;
}

function ownersFor(queryClient: QueryClient): Map<string, Set<symbol>> {
  let owners = ownersByClient.get(queryClient);
  if (!owners) {
    owners = new Map();
    ownersByClient.set(queryClient, owners);
  }
  return owners;
}

function recordMetric(metric: FindMonthIndexMetric): void {
  recentMetrics.push(metric);
  if (recentMetrics.length > 20) recentMetrics.shift();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<FindMonthIndexMetric>(FIND_MONTH_INDEX_METRIC_EVENT, {
        detail: metric,
      }),
    );
  }
}

export function getRecentFindMonthIndexMetrics(): readonly FindMonthIndexMetric[] {
  return recentMetrics;
}

export function prepareAvailableGamesDayIndexPage(
  page: AvailableGamesPage,
): AvailableGamesPage {
  if (!page.meta.dayIndexNextCursor) return page;
  return {
    ...page,
    meta: {
      ...page.meta,
      dayIndexTruncated: true,
      dayIndexContinuation: {
        generation: nextGeneration++,
        status: 'pending',
        pagesLoaded: 1,
        elapsedMs: 0,
        mergeMs: 0,
        resumeAttempts: 0,
      },
    },
  };
}

export function isAvailableGamesDayIndexContinuationRunning(
  page: AvailableGamesPage | undefined,
): boolean {
  const status = page?.meta.dayIndexContinuation?.status;
  return status === 'pending' || status === 'loading';
}

function updateContinuation(
  queryClient: QueryClient,
  queryKey: QueryKey,
  generation: number,
  update: (page: AvailableGamesPage) => AvailableGamesPage,
): void {
  queryClient.setQueryData<AvailableGamesPage>(queryKey, (current) => {
    if (!current || current.meta.dayIndexContinuation?.generation !== generation) {
      return current;
    }
    return update(current);
  });
}

function mergeRows(
  rowsById: Map<string, FindDayIndexRow>,
  incoming: FindDayIndexRow[] | undefined,
): FindDayIndexRow[] {
  for (const row of incoming ?? []) rowsById.set(row.id, row);
  return [...rowsById.values()];
}

function retryable(error: unknown): boolean {
  const status = (error as { response?: { status?: unknown } })?.response?.status;
  if (status === 408 || status === 429) return true;
  return !(typeof status === 'number' && status >= 400 && status < 500);
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });
}

function cancelJob(
  queryClient: QueryClient,
  queryKey: QueryKey,
  job: ContinuationJob,
  recordCancellation: boolean,
): void {
  if (job.finished) return;
  job.controller.abort();
  job.finished = true;
  jobsFor(queryClient).delete(keyId(queryKey));
  updateContinuation(queryClient, queryKey, job.generation, (page) => ({
    ...page,
    meta: {
      ...page.meta,
      dayIndexTruncated: true,
      dayIndexContinuation: {
        ...page.meta.dayIndexContinuation!,
        status: 'cancelled',
        pagesLoaded: job.pagesLoaded,
        elapsedMs: Math.max(0, job.now() - job.startedAt),
        mergeMs: job.mergeMs,
      },
    },
  }));
  job.resolveDone();
  if (recordCancellation) {
    recordMetric({
      outcome: 'cancelled',
      pagesLoaded: job.pagesLoaded,
      elapsedMs: Math.max(0, job.now() - job.startedAt),
      mergeMs: job.mergeMs,
      retries: job.retries,
      resumeAttempts: pageContinuationResumeAttempts(queryClient, queryKey, job.generation),
      budgetHit: false,
    });
  }
}

function pageContinuationResumeAttempts(
  queryClient: QueryClient,
  queryKey: QueryKey,
  generation: number,
): number {
  const continuation = queryClient.getQueryData<AvailableGamesPage>(queryKey)?.meta
    .dayIndexContinuation;
  return continuation?.generation === generation ? continuation.resumeAttempts : 0;
}

export function retainAvailableGamesDayIndexContinuation(
  queryClient: QueryClient,
  queryKey: QueryKey,
  owner: symbol,
): () => void {
  const id = keyId(queryKey);
  const owners = ownersFor(queryClient);
  const keyOwners = owners.get(id) ?? new Set<symbol>();
  keyOwners.add(owner);
  owners.set(id, keyOwners);
  return () => {
    const currentOwners = owners.get(id);
    currentOwners?.delete(owner);
    if (currentOwners && currentOwners.size > 0) return;
    owners.delete(id);
    const job = jobsFor(queryClient).get(id);
    if (job) cancelJob(queryClient, queryKey, job, true);
  };
}

export function waitForAvailableGamesDayIndexContinuation(
  queryClient: QueryClient,
  queryKey: QueryKey,
): Promise<void> | null {
  return jobsFor(queryClient).get(keyId(queryKey))?.done ?? null;
}

export function startAvailableGamesDayIndexContinuation({
  queryClient,
  queryKey,
  page,
  fetchPage,
  config: configOverrides,
  isResume = false,
}: StartContinuationInput): void {
  const continuation = page.meta.dayIndexContinuation;
  const initialCursor = page.meta.dayIndexNextCursor;
  if (!continuation || !initialCursor) return;

  const jobs = jobsFor(queryClient);
  const id = keyId(queryKey);
  const existing = jobs.get(id);
  if (existing?.generation === continuation.generation && !existing.finished) return;
  if (existing) cancelJob(queryClient, queryKey, existing, false);

  const config = { ...DEFAULT_CONFIG, ...configOverrides };
  const startedAt = config.now();
  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  const job: ContinuationJob = {
    controller: new AbortController(),
    done,
    resolveDone,
    generation: continuation.generation,
    finished: false,
    startedAt,
    now: config.now,
    pagesLoaded: continuation.pagesLoaded,
    mergeMs: continuation.mergeMs,
    retries: 0,
  };
  jobs.set(id, job);

  const rowsById = new Map((page.meta.dayIndex ?? []).map((row) => [row.id, row]));
  const visitedCursors = new Set<string>();
  let cursor: string | null = initialCursor;
  let pagesLoaded = continuation.pagesLoaded;
  let continuationPages = 0;
  let mergeMs = continuation.mergeMs;
  let retries = 0;
  const resumeAttempts = continuation.resumeAttempts + (isResume ? 1 : 0);

  const finish = (
    outcome: FindMonthIndexMetric['outcome'],
    failedCursor?: string,
    resumeEligible = false,
  ) => {
    if (job.finished) return;
    job.finished = true;
    jobs.delete(id);
    const elapsedMs = Math.max(0, config.now() - startedAt);
    updateContinuation(queryClient, queryKey, job.generation, (current) => ({
      ...current,
      meta: {
        ...current.meta,
        dayIndexTruncated: outcome === 'complete' ? false : true,
        dayIndexNextCursor: outcome === 'complete' ? null : current.meta.dayIndexNextCursor,
        dayIndexContinuation: {
          generation: job.generation,
          status: outcome,
          pagesLoaded,
          elapsedMs,
          mergeMs,
          resumeAttempts,
          resumeEligible: outcome === 'failed' && resumeEligible,
          ...(failedCursor ? { failedCursor } : {}),
        },
      },
    }));
    job.resolveDone();
    recordMetric({
      outcome,
      pagesLoaded,
      elapsedMs,
      mergeMs,
      retries,
      resumeAttempts,
      budgetHit: outcome === 'budget-exhausted',
    });
  };

  updateContinuation(queryClient, queryKey, job.generation, (current) => ({
    ...current,
    meta: {
      ...current.meta,
      dayIndexTruncated: true,
      dayIndexContinuation: {
        ...current.meta.dayIndexContinuation!,
        status: 'loading',
        resumeAttempts,
        resumeEligible: false,
      },
    },
  }));

  void (async () => {
    while (cursor && !job.controller.signal.aborted) {
      const elapsed = config.now() - startedAt;
      if (
        continuationPages >= config.maxContinuationPages ||
        elapsed >= config.maxDurationMs
      ) {
        finish('budget-exhausted');
        return;
      }
      if (visitedCursors.has(cursor)) {
        finish('failed', cursor);
        return;
      }
      visitedCursors.add(cursor);

      let incomingMeta: AvailableGamesPageMeta | undefined;
      let failureResumeEligible = false;
      for (let attempt = 0; attempt <= config.retryDelaysMs.length; attempt += 1) {
        if (job.controller.signal.aborted) return;
        const remainingMs = config.maxDurationMs - (config.now() - startedAt);
        if (remainingMs <= 0) {
          finish('budget-exhausted');
          return;
        }
        try {
          incomingMeta = await fetchPage(
            cursor,
            job.controller.signal,
            Math.max(1, Math.min(config.pageTimeoutMs, remainingMs)),
          );
          break;
        } catch (error) {
          if (job.controller.signal.aborted) return;
          failureResumeEligible = retryable(error);
          if (!failureResumeEligible || attempt >= config.retryDelaysMs.length) break;
          retries += 1;
          job.retries = retries;
          await abortableDelay(config.retryDelaysMs[attempt] ?? 0, job.controller.signal);
        }
      }

      if (job.controller.signal.aborted) return;
      if (!incomingMeta) {
        finish('failed', cursor, failureResumeEligible);
        return;
      }

      continuationPages += 1;
      pagesLoaded += 1;
      job.pagesLoaded = pagesLoaded;
      const mergeStartedAt = config.now();
      const mergedRows = mergeRows(rowsById, incomingMeta.dayIndex);
      mergeMs += Math.max(0, config.now() - mergeStartedAt);
      job.mergeMs = mergeMs;
      const nextCursor = incomingMeta.dayIndexNextCursor ?? null;
      const complete = !nextCursor && !incomingMeta.dayIndexTruncated;

      updateContinuation(queryClient, queryKey, job.generation, (current) => ({
        ...current,
        meta: {
          ...current.meta,
          dayIndex: mergedRows,
          dayIndexTruncated: !complete,
          dayIndexNextCursor: nextCursor,
          dayIndexContinuation: {
            generation: job.generation,
            status: complete ? 'complete' : 'loading',
            pagesLoaded,
            elapsedMs: Math.max(0, config.now() - startedAt),
            mergeMs,
            resumeAttempts,
            resumeEligible: false,
          },
        },
      }));

      if (complete) {
        finish('complete');
        return;
      }
      if (!nextCursor || visitedCursors.has(nextCursor)) {
        finish('failed', nextCursor ?? cursor);
        return;
      }
      cursor = nextCursor;
    }
  })();
}
