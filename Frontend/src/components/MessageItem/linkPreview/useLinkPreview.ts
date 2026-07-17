import { useEffect, useRef, useState, type RefObject } from 'react';
import { isAxiosError } from 'axios';
import {
  fetchLinkPreviewDetailed,
  isRichLinkPreview,
  type LinkPreviewData,
  type LinkPreviewOutcome,
  type LinkPreviewResponse,
} from '@/api/linkPreview';
import { isEligibleLinkPreviewUrl } from './eligibility';
import { useAuthStore } from '@/store/authStore';
import { shouldPreservePreviewDuringRefresh } from './linkPreviewRefreshPolicy';

const memoryCache = new Map<string, LinkPreviewData | null>();
const softMissUntil = new Map<string, number>();
const CACHE_MAX = 100;
const SOFT_MISS_MS = 20_000;
const PREVIEW_LOAD_ROOT_MARGIN = '1600px 0px';
const IN_FLIGHT = new Map<string, Promise<LinkPreviewResponse>>();
const outcomes = new Map<string, LinkPreviewOutcome>();
const retryNotBefore = new Map<string, number>();

function cacheKeyFor(url: string): string {
  const viewerKey = useAuthStore.getState().user?.id ?? 'anonymous';
  try {
    const u = new URL(url);
    u.hash = '';
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '');
    return `${viewerKey}:${u.toString()}`;
  } catch {
    return `${viewerKey}:${url}`;
  }
}

function cacheGet(key: string): LinkPreviewData | null | undefined {
  if (memoryCache.has(key)) return memoryCache.get(key);
  const softUntil = softMissUntil.get(key);
  if (softUntil && Date.now() < softUntil) return null;
  if (softUntil) softMissUntil.delete(key);
  return undefined;
}

function cacheSet(
  key: string,
  value: LinkPreviewData | null,
  softMiss = false,
  softMissMs = SOFT_MISS_MS
): void {
  if (value === null && softMiss) {
    softMissUntil.set(key, Date.now() + softMissMs);
    memoryCache.delete(key);
    return;
  }
  softMissUntil.delete(key);
  if (memoryCache.size >= CACHE_MAX) {
    const oldest = memoryCache.keys().next().value;
    if (oldest) memoryCache.delete(oldest);
  }
  memoryCache.set(key, value);
}

export function peekCachedLinkPreview(url: string): LinkPreviewData | null | undefined {
  if (!isEligibleLinkPreviewUrl(url)) return undefined;
  return cacheGet(cacheKeyFor(url));
}

/** Warm FE cache (composer paste prefetch). */
export function prefetchLinkPreview(url: string): void {
  if (!isEligibleLinkPreviewUrl(url)) return;
  const key = cacheKeyFor(url);
  if (cacheGet(key) !== undefined || IN_FLIGHT.has(key)) return;
  const ac = new AbortController();
  const pending = fetchLinkPreviewDetailed(url, { signal: ac.signal })
    .then((result) => {
      const rich = isRichLinkPreview(result.preview) ? result.preview : null;
      outcomes.set(key, result.outcome);
      if (result.retryAfterMs) retryNotBefore.set(key, Date.now() + result.retryAfterMs);
      cacheSet(key, rich, result.outcome === 'temporary', result.retryAfterMs ?? SOFT_MISS_MS);
      return { ...result, preview: rich };
    })
    .catch((err: unknown) => {
      if (isAxiosError(err) && (err.response?.status === 429 || err.response?.status === 401)) {
        outcomes.set(key, 'temporary');
        return { preview: null, outcome: 'temporary' as const, retryAfterMs: null, snapshotToken: null };
      }
      const soft =
        isAxiosError(err) &&
        (!err.response || err.response.status >= 500 || err.code === 'ECONNABORTED');
      cacheSet(key, null, soft);
      outcomes.set(key, soft ? 'temporary' : 'unsupported');
      return {
        preview: null,
        outcome: soft ? ('temporary' as const) : ('unsupported' as const),
        retryAfterMs: null,
        snapshotToken: null,
      };
    })
    .finally(() => {
      IN_FLIGHT.delete(key);
    });
  IN_FLIGHT.set(key, pending);
}

export function seedLinkPreviewCache(url: string, data: LinkPreviewData | null): void {
  if (!url) return;
  cacheSet(cacheKeyFor(url), isRichLinkPreview(data) ? data : null);
}

async function loadPreview(
  url: string,
  signal: AbortSignal,
  force = false
): Promise<LinkPreviewResponse> {
  const key = cacheKeyFor(url);
  const cached = force ? undefined : cacheGet(key);
  if (cached !== undefined) {
    return {
      preview: cached,
      outcome: cached ? 'ready' : outcomes.get(key) ?? 'unsupported',
      retryAfterMs: Math.max(0, (retryNotBefore.get(key) ?? 0) - Date.now()) || null,
      snapshotToken: null,
    };
  }

  let pending = IN_FLIGHT.get(key);
  if (!pending) {
    pending = fetchLinkPreviewDetailed(url)
      .then((result) => {
        const rich = isRichLinkPreview(result.preview) ? result.preview : null;
        outcomes.set(key, result.outcome);
        if (result.retryAfterMs) retryNotBefore.set(key, Date.now() + result.retryAfterMs);
        cacheSet(key, rich, result.outcome === 'temporary', result.retryAfterMs ?? SOFT_MISS_MS);
        return { ...result, preview: rich };
      })
      .catch((err: unknown) => {
        if (signal.aborted) {
          return { preview: null, outcome: 'temporary' as const, retryAfterMs: null, snapshotToken: null };
        }
        if (isAxiosError(err) && (err.code === 'ERR_CANCELED' || err.name === 'CanceledError')) {
          return { preview: null, outcome: 'temporary' as const, retryAfterMs: null, snapshotToken: null };
        }
        if (isAxiosError(err) && (err.response?.status === 429 || err.response?.status === 401)) {
          outcomes.set(key, 'temporary');
          return { preview: null, outcome: 'temporary' as const, retryAfterMs: null, snapshotToken: null };
        }
        const soft =
          isAxiosError(err) &&
          (!err.response || err.response.status >= 500 || err.code === 'ECONNABORTED');
        cacheSet(key, null, soft);
        outcomes.set(key, soft ? 'temporary' : 'unsupported');
        return {
          preview: null,
          outcome: soft ? ('temporary' as const) : ('unsupported' as const),
          retryAfterMs: null,
          snapshotToken: null,
        };
      })
      .finally(() => {
        IN_FLIGHT.delete(key);
      });
    IN_FLIGHT.set(key, pending);
  }

  const result = await pending;
  if (signal.aborted) {
    return { preview: null, outcome: 'temporary', retryAfterMs: null, snapshotToken: null };
  }
  return result;
}

export type LinkPreviewStatus = 'idle' | 'loading' | 'ready' | 'unsupported' | 'failed';

function resolveInitialLinkPreviewState(
  url: string | null | undefined,
  initialPreview: LinkPreviewData | null | undefined
): { status: LinkPreviewStatus; preview: LinkPreviewData | null } {
  if (isRichLinkPreview(initialPreview)) {
    return { status: 'ready', preview: initialPreview };
  }
  if (!url || !isEligibleLinkPreviewUrl(url)) {
    return { status: 'idle', preview: null };
  }
  const key = cacheKeyFor(url);
  const cached = cacheGet(key);
  if (cached === undefined) {
    return { status: 'idle', preview: null };
  }
  return {
    status: cached ? 'ready' : outcomes.get(key) === 'temporary' ? 'failed' : 'unsupported',
    preview: cached,
  };
}

export function useLinkPreview(
  url: string | null | undefined,
  rootRef: RefObject<Element | null>,
  initialPreview?: LinkPreviewData | null
): {
  status: LinkPreviewStatus;
  preview: LinkPreviewData | null;
  canRetry: boolean;
  retry: () => void;
} {
  const initialStateRef = useRef<ReturnType<typeof resolveInitialLinkPreviewState> | null>(null);
  initialStateRef.current ??= resolveInitialLinkPreviewState(url, initialPreview);
  const [status, setStatus] = useState<LinkPreviewStatus>(initialStateRef.current.status);
  const [preview, setPreview] = useState<LinkPreviewData | null>(initialStateRef.current.preview);
  const previewRef = useRef(preview);
  previewRef.current = preview;
  const startedRef = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [visible, setVisible] = useState(true);
  const [retryAt, setRetryAt] = useState(0);
  const [retryReady, setRetryReady] = useState(true);
  const automaticFailuresRef = useRef(0);

  useEffect(() => {
    const element = rootRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry?.isIntersecting ?? false),
      { rootMargin: '180px 0px', threshold: 0.01 }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [rootRef, url]);

  useEffect(() => {
    startedRef.current = false;

    if (!url || !isEligibleLinkPreviewUrl(url)) {
      setStatus('idle');
      setPreview(null);
      return;
    }

    const key = cacheKeyFor(url);
    const cachedBeforeInitial = cacheGet(key);
    const refreshInitial =
      isRichLinkPreview(initialPreview) &&
      initialPreview.mutable &&
      cachedBeforeInitial === undefined;
    const preserveDuringRefresh = shouldPreservePreviewDuringRefresh({
      attempt,
      hasCurrentPreview: isRichLinkPreview(previewRef.current),
      refreshingInitialPreview: refreshInitial,
    });
    if (isRichLinkPreview(initialPreview)) {
      seedLinkPreviewCache(url, initialPreview);
      setPreview(initialPreview);
      setStatus('ready');
      if (!refreshInitial) return;
    }

    const cached = refreshInitial || attempt > 0 ? undefined : cachedBeforeInitial;
    if (cached !== undefined) {
      setPreview(cached);
      setStatus(cached ? 'ready' : outcomes.get(key) === 'temporary' ? 'failed' : 'unsupported');
      setRetryAt(retryNotBefore.get(key) ?? 0);
      return;
    }

    let cancelled = false;
    const ac = new AbortController();
    if (!preserveDuringRefresh) {
      setStatus('loading');
      setPreview(null);
    }

    const start = () => {
      if (startedRef.current || cancelled) return;
      startedRef.current = true;
      void loadPreview(url, ac.signal, attempt > 0 || refreshInitial).then(({ preview: data, outcome, retryAfterMs }) => {
        if (cancelled) return;
        setRetryAt(retryAfterMs ? Date.now() + retryAfterMs : 0);
        if (data) {
          automaticFailuresRef.current = 0;
          setPreview(data);
          setStatus('ready');
        } else if (!preserveDuringRefresh) {
          setPreview(null);
          setStatus(outcome === 'temporary' ? 'failed' : 'unsupported');
        } else if (outcome === 'temporary') {
          automaticFailuresRef.current += 1;
        }
      });
    };

    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      const idleId =
        typeof window !== 'undefined' && 'requestIdleCallback' in window
          ? window.requestIdleCallback(() => start(), { timeout: 600 })
          : undefined;
      const timeoutId = idleId === undefined ? setTimeout(start, 0) : undefined;
      return () => {
        cancelled = true;
        ac.abort();
        if (idleId !== undefined && 'cancelIdleCallback' in window) {
          window.cancelIdleCallback(idleId);
        }
        if (timeoutId !== undefined) clearTimeout(timeoutId);
      };
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          start();
          io.disconnect();
        }
      },
      { root: null, rootMargin: PREVIEW_LOAD_ROOT_MARGIN, threshold: 0.01 }
    );
    io.observe(el);

    return () => {
      cancelled = true;
      ac.abort();
      io.disconnect();
    };
  }, [url, rootRef, initialPreview, attempt]);

  useEffect(() => {
    if (!preview?.mutable || !url || !visible) return;
    if (automaticFailuresRef.current >= 3) return;
    const entityDelay = preview.entityType === 'market' ? 45_000 : 20_000;
    const backoffDelay = entityDelay * Math.pow(2, automaticFailuresRef.current);
    const delay = Math.max(backoffDelay, retryAt - Date.now());
    const timer = window.setTimeout(() => {
      if (document.visibilityState === 'visible') setAttempt((value) => value + 1);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [preview, url, attempt, visible, retryAt]);

  useEffect(() => {
    if (retryAt <= Date.now()) {
      setRetryReady(true);
      return;
    }
    setRetryReady(false);
    const timer = window.setTimeout(() => setRetryReady(true), retryAt - Date.now());
    return () => window.clearTimeout(timer);
  }, [retryAt]);

  return {
    status,
    preview,
    canRetry: retryReady,
    retry: () => {
      if (retryAt > Date.now()) return;
      automaticFailuresRef.current = 0;
      setAttempt((value) => value + 1);
    },
  };
}
