import { useTranslation } from 'react-i18next';
import { LiveTvToolbar } from './LiveTvToolbar';
import type { LiveBoardTheme } from '@/utils/liveScoring';

type LiveMatchPageChromeProps = {
  tv: boolean;
  showTvChrome: boolean;
  gameId: string;
  gameTitle: string;
  isOnline: boolean;
  boardTheme: LiveBoardTheme;
  controlUrl: string;
  broadcastShareUrl: string;
  spectatorTvUrl: string;
  timerDisplay: string | null;
  onBack: () => void;
};

export function LiveMatchPageChrome({
  tv,
  showTvChrome,
  gameId,
  gameTitle,
  isOnline,
  boardTheme,
  controlUrl,
  broadcastShareUrl,
  spectatorTvUrl,
  timerDisplay,
  onBack,
}: LiveMatchPageChromeProps) {
  const { t } = useTranslation();

  if (!tv) {
    return (
      <header className="relative flex shrink-0 items-center border-b border-gray-200 px-3 py-2 dark:border-gray-800">
        <button
          type="button"
          className="relative z-10 shrink-0 text-sm opacity-80 hover:opacity-100"
          onClick={onBack}
        >
          ←
        </button>
        <div className="pointer-events-none absolute inset-x-0 flex justify-center px-10">
          <div className="max-w-full truncate text-center text-sm font-medium">
            {gameTitle.trim() ? gameTitle : null}
          </div>
        </div>
        <div
          className={`absolute right-3 top-1/2 z-10 inline-flex h-6 -translate-y-1/2 items-center justify-center rounded-full border border-transparent px-2 text-xs leading-none ${
            isOnline
              ? 'bg-emerald-600/15 text-emerald-800 dark:text-emerald-200'
              : 'bg-amber-600/15 text-amber-900 dark:text-amber-100'
          }`}
          aria-live="polite"
        >
          {isOnline ? t('gameDetails.liveTvPillLive') : t('gameDetails.liveTvPillOffline')}
        </div>
      </header>
    );
  }

  return (
    <>
      {showTvChrome ? (
        <div className="pointer-events-auto absolute inset-x-0 top-0 z-30 flex justify-center px-2 pt-[env(safe-area-inset-top)]">
          <LiveTvToolbar
            gameId={gameId}
            gameTitle={gameTitle}
            isOnline={isOnline}
            controlUrl={controlUrl}
            broadcastUrl={broadcastShareUrl}
            spectatorUrl={spectatorTvUrl}
            timerDisplay={timerDisplay}
          />
        </div>
      ) : null}
      {!showTvChrome && gameTitle.trim() ? (
        <div
          className={`pointer-events-none absolute left-0 right-0 top-0 z-20 flex justify-center px-3 pr-[min(12rem,calc(100%-1rem))] pt-[max(0.5rem,env(safe-area-inset-top))]`}
        >
          <div
            className={`min-w-0 max-w-full truncate text-center text-sm font-semibold sm:text-base ${
              boardTheme === 'light' ? 'text-gray-900 drop-shadow-sm' : 'text-white drop-shadow-md'
            }`}
          >
            {gameTitle}
          </div>
        </div>
      ) : null}
      {!showTvChrome ? (
        <div
          className={`pointer-events-none absolute z-20 max-w-[min(11rem,calc(100%-1.5rem))] rounded-full border px-2.5 py-1 text-xs font-medium shadow-md ${
            boardTheme === 'light'
              ? isOnline
                ? 'border-emerald-600/25 bg-emerald-500/15 text-emerald-900'
                : 'border-amber-600/30 bg-amber-500/20 text-amber-950'
              : isOnline
                ? 'border-white/15 bg-emerald-500/20 text-emerald-100'
                : 'border-white/15 bg-amber-500/25 text-amber-50'
          }`}
          style={{
            top: 'max(0.5rem, env(safe-area-inset-top))',
            right: 'max(0.5rem, env(safe-area-inset-right))',
          }}
        >
          {isOnline ? t('gameDetails.liveTvPillLive') : t('gameDetails.liveTvPillOffline')}
        </div>
      ) : null}
    </>
  );
}
