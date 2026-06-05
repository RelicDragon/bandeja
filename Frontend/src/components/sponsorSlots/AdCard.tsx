import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useResolvedAppAppearance } from '@/store/themeStore';
import type { AdPlacementPayload } from '@/api/sponsorPlacements';

type AdCardProps = {
  payload: AdPlacementPayload;
  onClick: () => void;
  onDismiss?: () => void;
};

export function AdCard({ payload, onClick, onDismiss }: AdCardProps) {
  const { t } = useTranslation();
  const appearance = useResolvedAppAppearance();
  const isDark = appearance === 'dark';

  const imageUrl = useMemo(() => {
    if (isDark && payload.imageUrlDark) return payload.imageUrlDark;
    return payload.imageUrl;
  }, [isDark, payload.imageUrl, payload.imageUrlDark]);

  const disclosureText =
    payload.disclosureLabel?.trim() || t('ads.sponsored', { defaultValue: 'Sponsored' });

  const hasText = Boolean(payload.title || payload.subtitle || payload.ctaLabel);

  return (
    <div className="relative w-full min-w-0">
      {!payload.hideDisclosure && (
        <span className="absolute left-3 top-3 z-10 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white backdrop-blur-sm">
          {disclosureText}
        </span>
      )}
      {payload.dismissible && onDismiss && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDismiss();
          }}
          className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white backdrop-blur-sm transition hover:bg-black/60"
          aria-label={t('ads.dismiss', { defaultValue: 'Dismiss ad' })}
        >
          <X className="h-4 w-4" strokeWidth={2} aria-hidden />
        </button>
      )}
      <button
        type="button"
        onClick={onClick}
        className="group block w-full min-w-0 overflow-hidden rounded-2xl border border-gray-200/90 bg-white text-left shadow-sm transition hover:border-primary-200 hover:shadow-md dark:border-gray-700 dark:bg-gray-900 dark:hover:border-primary-700"
      >
        <div className="relative aspect-[3/1] w-full overflow-hidden bg-gray-100 dark:bg-gray-800">
          <img
            src={imageUrl}
            alt={payload.title ?? disclosureText}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            loading="lazy"
            decoding="async"
          />
        </div>
        {hasText && (
          <div className="space-y-1 px-4 py-3">
            {payload.title && (
              <p className="line-clamp-2 text-sm font-semibold text-gray-900 dark:text-white">{payload.title}</p>
            )}
            {payload.subtitle && (
              <p className="line-clamp-2 text-xs text-gray-600 dark:text-gray-400">{payload.subtitle}</p>
            )}
            {payload.ctaLabel && (
              <span className="inline-flex text-xs font-semibold text-primary-600 dark:text-primary-400">
                {payload.ctaLabel}
              </span>
            )}
          </div>
        )}
      </button>
    </div>
  );
}
