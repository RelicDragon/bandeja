import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type GameTextTranslationControlProps = {
  showOriginal: boolean;
  hasToggle: boolean;
  onToggle: () => void;
  /** Place control inline beside a heading row when true. */
  compact?: boolean;
  className?: string;
  a11yAnnouncement?: string;
};

/**
 * Quiet details control: `Translated · Show original` / `Original · Show translation`.
 * Omits badge when there is nothing to toggle (display === original).
 */
export function GameTextTranslationControl({
  showOriginal,
  hasToggle,
  onToggle,
  compact = false,
  className = '',
  a11yAnnouncement = '',
}: GameTextTranslationControlProps) {
  const { t } = useTranslation();

  if (!hasToggle && !a11yAnnouncement) return null;

  const statusLabel = showOriginal
    ? t('gameDetails.gameText.original', { defaultValue: 'Original' })
    : t('gameDetails.gameText.translated', { defaultValue: 'Translated' });
  const actionLabel = showOriginal
    ? t('gameDetails.gameText.showTranslation', { defaultValue: 'Show translation' })
    : t('gameDetails.gameText.showOriginal', { defaultValue: 'Show original' });

  return (
    <div
      className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 ${compact ? '' : 'mt-1'} ${className}`}
    >
      <span className="sr-only" aria-live="polite">
        {a11yAnnouncement}
      </span>
      {hasToggle && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-gray-500 opacity-70 transition-colors hover:text-gray-700 hover:opacity-100 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <Languages size={10} aria-hidden />
          <span>
            {statusLabel}
            <span aria-hidden className="mx-1 opacity-60">
              ·
            </span>
            {actionLabel}
          </span>
        </button>
      )}
    </div>
  );
}
