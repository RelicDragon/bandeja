import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import type { GiphySearchItem } from '@/api/giphy';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

type GiphySearchGridProps = {
  items: GiphySearchItem[];
  onSelect: (item: GiphySearchItem) => void;
  busy?: boolean;
  emptyLabel: string;
  loadingMore?: boolean;
  loadMoreError?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onRetryLoadMore?: () => void;
};

export function GiphySearchGrid({
  items,
  onSelect,
  busy = false,
  emptyLabel,
  loadingMore = false,
  loadMoreError = false,
  hasMore = false,
  onLoadMore,
  onRetryLoadMore,
}: GiphySearchGridProps) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasMore || !onLoadMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !busy && !loadingMore) onLoadMore();
      },
      { rootMargin: '240px' }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [busy, hasMore, loadingMore, onLoadMore]);

  if (items.length === 0) {
    return (
      <div className="flex min-h-[10rem] items-center justify-center px-4 text-center text-sm text-gray-500 dark:text-gray-400">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="pb-2">
      <div
        className="grid grid-cols-[repeat(auto-fit,minmax(90px,1fr))]"
        data-testid="giphy-search-grid"
      >
        {items.map((item, index) => {
          // Prefer still frame when present; Klipy has no staticUrl — keep preview.
          const displayUrl =
            reduceMotion && item.staticUrl ? item.staticUrl : item.previewUrl;
          return (
            <button
              key={`${item.provider}:${item.id}`}
              type="button"
              disabled={busy}
              onClick={() => onSelect(item)}
              className="group relative aspect-square overflow-hidden bg-gray-100 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 disabled:opacity-50 dark:bg-gray-800"
              title={item.title}
              data-testid={`giphy-result-${item.id}`}
            >
              {displayUrl ? (
                <img
                  src={displayUrl}
                  alt={item.title}
                  loading={index < 9 ? 'eager' : 'lazy'}
                  decoding="async"
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center px-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
                  GIF
                </span>
              )}
            </button>
          );
        })}
      </div>
      {hasMore || loadMoreError ? (
        <div ref={loadMoreRef} className="flex justify-center pt-3">
          <button
            type="button"
            disabled={busy || loadingMore}
            onClick={loadMoreError ? onRetryLoadMore : onLoadMore}
            className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            data-testid="giphy-load-more"
          >
            {loadingMore ? <Loader2 size={16} className="animate-spin" /> : null}
            {loadMoreError
              ? t('common.retry', { defaultValue: 'Retry' })
              : t('chat.giphy.loadMore', { defaultValue: 'Load more' })}
          </button>
        </div>
      ) : null}
    </div>
  );
}
