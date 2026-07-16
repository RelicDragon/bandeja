import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import type { GiphySearchItem } from '@/api/giphy';

type GiphySearchGridProps = {
  items: GiphySearchItem[];
  onSelect: (item: GiphySearchItem) => void;
  busy?: boolean;
  emptyLabel: string;
  loadingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
};

export function GiphySearchGrid({
  items,
  onSelect,
  busy = false,
  emptyLabel,
  loadingMore = false,
  hasMore = false,
  onLoadMore,
}: GiphySearchGridProps) {
  const { t } = useTranslation();

  if (items.length === 0) {
    return (
      <div className="flex min-h-[10rem] items-center justify-center px-4 text-center text-sm text-gray-500 dark:text-gray-400">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="px-2 pb-2">
      <div
        className="grid grid-cols-2 gap-1.5 sm:grid-cols-3"
        data-testid="giphy-search-grid"
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={busy}
            onClick={() => onSelect(item)}
            className="group relative aspect-square overflow-hidden rounded-xl bg-gray-100 disabled:opacity-50 dark:bg-gray-800"
            title={item.title}
            data-testid={`giphy-result-${item.id}`}
          >
            <img
              src={item.previewUrl}
              alt={item.title}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105 group-active:scale-95"
              draggable={false}
            />
          </button>
        ))}
      </div>
      {hasMore ? (
        <div className="flex justify-center pt-3">
          <button
            type="button"
            disabled={busy || loadingMore}
            onClick={onLoadMore}
            className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            data-testid="giphy-load-more"
          >
            {loadingMore ? <Loader2 size={16} className="animate-spin" /> : null}
            {t('chat.giphy.loadMore', { defaultValue: 'Load more' })}
          </button>
        </div>
      ) : null}
    </div>
  );
}
