import { useEffect, useState } from 'react';
import { fetchLinkPreview, type LinkPreviewData } from '@/api/linkPreview';
import { isEligibleExternalLinkPreviewUrl } from './eligibility';

const memoryCache = new Map<string, LinkPreviewData | null>();
const CACHE_MAX = 80;

function cacheGet(url: string): LinkPreviewData | null | undefined {
  return memoryCache.has(url) ? memoryCache.get(url) : undefined;
}

function cacheSet(url: string, value: LinkPreviewData | null): void {
  if (memoryCache.size >= CACHE_MAX) {
    const oldest = memoryCache.keys().next().value;
    if (oldest) memoryCache.delete(oldest);
  }
  memoryCache.set(url, value);
}

export type LinkPreviewStatus = 'idle' | 'loading' | 'ready' | 'empty';

export function useLinkPreview(url: string | null | undefined): {
  status: LinkPreviewStatus;
  preview: LinkPreviewData | null;
} {
  const [status, setStatus] = useState<LinkPreviewStatus>('idle');
  const [preview, setPreview] = useState<LinkPreviewData | null>(null);

  useEffect(() => {
    if (!url || !isEligibleExternalLinkPreviewUrl(url)) {
      setStatus('idle');
      setPreview(null);
      return;
    }

    const cached = cacheGet(url);
    if (cached !== undefined) {
      setPreview(cached);
      setStatus(cached ? 'ready' : 'empty');
      return;
    }

    let cancelled = false;
    const ac = new AbortController();
    setStatus('loading');
    setPreview(null);

    const run = () => {
      void fetchLinkPreview(url, { signal: ac.signal })
        .then((data) => {
          if (cancelled) return;
          const rich =
            data && (data.title || data.description || data.imageUrl) ? data : null;
          cacheSet(url, rich);
          setPreview(rich);
          setStatus(rich ? 'ready' : 'empty');
        })
        .catch(() => {
          if (cancelled) return;
          cacheSet(url, null);
          setPreview(null);
          setStatus('empty');
        });
    };

    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(() => run(), { timeout: 1200 });
    } else {
      timeoutId = setTimeout(run, 0);
    }

    return () => {
      cancelled = true;
      ac.abort();
      if (idleId !== undefined && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [url]);

  return { status, preview };
}
