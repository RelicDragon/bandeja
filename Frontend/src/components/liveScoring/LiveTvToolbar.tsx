import { QRCodeSVG } from 'qrcode.react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  liveBoardThemeSearchParam,
  parseLiveBoardTheme,
  type LiveBoardTheme,
} from '@/utils/liveScoring';

type LiveTvToolbarProps = {
  gameId: string;
  gameTitle: string;
  isOnline: boolean;
  controlUrl: string;
  broadcastUrl?: string;
  spectatorUrl?: string;
  timerDisplay: string | null;
};

export const LiveTvToolbar = ({
  gameId,
  gameTitle,
  isOnline,
  controlUrl,
  broadcastUrl,
  spectatorUrl,
  timerDisplay,
}: LiveTvToolbarProps) => {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const boardTheme = parseLiveBoardTheme(searchParams.get('theme'));

  const setBoardTheme = (next: LiveBoardTheme) => {
    const p = new URLSearchParams(searchParams);
    p.set('theme', liveBoardThemeSearchParam(next));
    setSearchParams(p, { replace: true });
  };

  const copyLink = async () => {
    if (!controlUrl) return;
    try {
      await navigator.clipboard.writeText(controlUrl);
      toast.success(t('gameDetails.linkCopied'));
    } catch {
      toast.error(t('gameDetails.copyError'));
    }
  };

  const copyBroadcastLink = async () => {
    if (!broadcastUrl) return;
    try {
      await navigator.clipboard.writeText(broadcastUrl);
      toast.success(t('gameDetails.linkCopied'));
    } catch {
      toast.error(t('gameDetails.copyError'));
    }
  };

  const copySpectatorLink = async () => {
    if (!spectatorUrl) return;
    try {
      await navigator.clipboard.writeText(spectatorUrl);
      toast.success(t('gameDetails.linkCopied'));
    } catch {
      toast.error(t('gameDetails.copyError'));
    }
  };

  const bar =
    boardTheme === 'light'
      ? 'mx-auto flex w-full max-w-4xl flex-col gap-3 rounded-b-2xl border border-gray-200 bg-white/95 px-4 py-3 shadow-xl backdrop-blur-md'
      : 'mx-auto flex w-full max-w-4xl flex-col gap-3 rounded-b-2xl border border-white/15 bg-black/90 px-4 py-3 shadow-xl backdrop-blur-md';
  const exitLink =
    boardTheme === 'light'
      ? 'shrink-0 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-gray-100'
      : 'shrink-0 rounded-lg border border-white/20 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/10';
  const pillCls =
    boardTheme === 'light'
      ? isOnline
        ? 'shrink-0 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-900'
        : 'shrink-0 rounded-full bg-amber-500/25 px-2 py-0.5 text-xs font-medium text-amber-950'
      : isOnline
        ? 'shrink-0 rounded-full bg-emerald-500/25 px-2 py-0.5 text-xs font-medium text-emerald-200'
        : 'shrink-0 rounded-full bg-amber-500/25 px-2 py-0.5 text-xs font-medium text-amber-100';
  const timerCls =
    boardTheme === 'light'
      ? 'font-mono text-xl font-bold tabular-nums tracking-tight text-gray-900'
      : 'font-mono text-xl font-bold tabular-nums tracking-tight text-white';
  const qrCardBorder = boardTheme === 'light' ? 'border-gray-200' : 'border-white/10';
  const segWrap = boardTheme === 'light' ? 'border-gray-300 bg-gray-100/80' : 'border-white/25 bg-white/5';
  const segBtnBase = 'px-2.5 py-1 text-xs font-semibold transition-colors sm:px-3';
  const segActiveDark =
    boardTheme === 'light'
      ? 'bg-white text-gray-900 shadow-sm'
      : 'bg-white/20 text-white shadow-sm';
  const segInactive =
    boardTheme === 'light' ? 'text-gray-600 hover:text-gray-900' : 'text-white/70 hover:text-white';

  const qrCardBase =
    'flex min-w-0 max-w-full flex-1 flex-col gap-2 rounded-xl border bg-white p-2 sm:min-w-[17rem] sm:max-w-[20rem] sm:flex-row sm:items-center sm:flex-initial';

  return (
    <div data-tv-chrome className={`${bar} min-w-0`}>
      {gameTitle.trim() ? (
        <div
          className={`min-w-0 truncate border-b px-1 pb-3 text-center text-base font-semibold sm:text-lg ${
            boardTheme === 'light' ? 'border-gray-200 text-gray-900' : 'border-white/10 text-white'
          }`}
        >
          {gameTitle}
        </div>
      ) : null}
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <Link to={`/games/${gameId}`} className={exitLink}>
            {t('gameDetails.liveTvExit')}
          </Link>
          <div
            className={`inline-flex shrink-0 overflow-hidden rounded-lg border p-0.5 ${segWrap}`}
            role="group"
            aria-label={t('gameDetails.liveTvThemeLabel')}
          >
            <button
              type="button"
              className={`${segBtnBase} rounded-md ${boardTheme === 'dark' ? segActiveDark : segInactive}`}
              aria-pressed={boardTheme === 'dark'}
              onClick={() => setBoardTheme('dark')}
            >
              {t('gameDetails.liveTvThemeDark')}
            </button>
            <button
              type="button"
              className={`${segBtnBase} rounded-md ${boardTheme === 'light' ? segActiveDark : segInactive}`}
              aria-pressed={boardTheme === 'light'}
              onClick={() => setBoardTheme('light')}
            >
              {t('gameDetails.liveTvThemeLight')}
            </button>
          </div>
          <span className={pillCls}>{isOnline ? t('gameDetails.liveTvPillLive') : t('gameDetails.liveTvPillOffline')}</span>
          {timerDisplay ? <div className={`${timerCls} shrink-0`}>{timerDisplay}</div> : null}
        </div>
        <div className="grid w-full min-w-0 grid-cols-1 gap-3 min-[520px]:grid-cols-2 min-[900px]:grid-cols-3">
          {controlUrl ? (
            <div className={`${qrCardBase} ${qrCardBorder}`}>
              <div className="mx-auto shrink-0 sm:mx-0">
                <QRCodeSVG value={controlUrl} size={96} level="M" fgColor="#000000" bgColor="#ffffff" />
              </div>
              <div className="min-w-0 flex-1 text-[10px] leading-tight text-gray-800">
                <div className="font-semibold">{t('gameDetails.liveTvScoreOnPhone')}</div>
                <button
                  type="button"
                  className="mt-1 text-left text-primary-600 underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    void copyLink();
                  }}
                >
                  {t('gameDetails.liveTvCopyLink')}
                </button>
              </div>
            </div>
          ) : null}
          {broadcastUrl ? (
            <div className={`${qrCardBase} ${qrCardBorder}`}>
              <div className="mx-auto shrink-0 sm:mx-0">
                <QRCodeSVG value={broadcastUrl} size={96} level="M" fgColor="#000000" bgColor="#ffffff" />
              </div>
              <div className="min-w-0 flex-1 text-[10px] leading-tight text-gray-800">
                <div className="font-semibold">{t('gameDetails.liveTvBroadcastHint')}</div>
                <button
                  type="button"
                  className="mt-1 text-left text-primary-600 underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    void copyBroadcastLink();
                  }}
                >
                  {t('gameDetails.liveTvCopyBroadcastLink')}
                </button>
              </div>
            </div>
          ) : null}
          {spectatorUrl ? (
            <div
              className={`${qrCardBase} ${
                boardTheme === 'light' ? 'border-emerald-600/35' : 'border-emerald-500/30'
              }`}
            >
              <div className="mx-auto shrink-0 sm:mx-0">
                <QRCodeSVG value={spectatorUrl} size={96} level="M" fgColor="#000000" bgColor="#ffffff" />
              </div>
              <div className="min-w-0 flex-1 text-[10px] leading-tight text-gray-800">
                <div className="font-semibold">{t('gameDetails.liveTvSpectatorHint')}</div>
                <button
                  type="button"
                  className="mt-1 text-left text-primary-600 underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    void copySpectatorLink();
                  }}
                >
                  {t('gameDetails.liveTvCopySpectatorLink')}
                </button>
              </div>
            </div>
          ) : null}
        </div>
    </div>
  );
};
