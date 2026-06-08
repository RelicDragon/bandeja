import { useTranslation } from 'react-i18next';
import type { LiveBoardTheme } from '@/utils/liveScoring';

type LiveMatchRevisionFooterProps = {
  revision: number;
  saving: boolean;
  boardTheme: LiveBoardTheme;
  tv: boolean;
};

export function LiveMatchRevisionFooter({ revision, saving, boardTheme, tv }: LiveMatchRevisionFooterProps) {
  const { t } = useTranslation();

  return (
    <div
      className={`pointer-events-none fixed z-[45] tabular-nums ${
        tv
          ? boardTheme === 'light'
            ? 'text-[10px] text-gray-600 opacity-70 sm:text-xs'
            : 'text-[10px] text-white/55 sm:text-xs'
          : 'text-[10px] text-gray-500 opacity-70 dark:text-gray-400 sm:text-xs'
      }`}
      style={{
        bottom: 'max(0.5rem, env(safe-area-inset-bottom))',
        ...(tv
          ? { right: 'max(0.5rem, env(safe-area-inset-right))' }
          : { left: 'max(0.5rem, env(safe-area-inset-left))' }),
      }}
    >
      <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <span>
          {t('gameDetails.liveScoring.rev')} {revision}
        </span>
        {saving ? (
          <span className="inline-flex max-w-[min(100vw-5rem,10rem)] items-center justify-center truncate rounded-full border border-primary-400/35 bg-primary-500/12 px-1.5 py-px text-[10px] leading-none text-primary-900 dark:border-primary-500/30 dark:bg-primary-500/15 dark:text-primary-100 sm:px-2 sm:text-xs">
            {t('gameDetails.liveScoring.syncing')}
          </span>
        ) : null}
      </span>
    </div>
  );
}
