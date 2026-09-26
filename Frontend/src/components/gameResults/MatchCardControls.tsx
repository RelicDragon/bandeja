import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, PenLine, Play } from 'lucide-react';
import { livePlayPath } from './useMatchCardActions';

const stop = (e: MouseEvent) => e.stopPropagation();

export const MatchEditDoneButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-primary-600 px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 active:scale-95"
  >
    <Check size={14} aria-hidden />
    {label}
  </button>
);

const LIVE_BUTTON_CLASS =
  'inline-flex shrink-0 items-center justify-center rounded-full border border-primary-200 bg-primary-50 text-primary-700 transition-colors hover:bg-primary-100 active:scale-95 dark:border-primary-800 dark:bg-primary-950/40 dark:text-primary-300 dark:hover:bg-primary-900/50';

export const LivePlayLink = ({
  gameId,
  matchId,
  size = 'md',
}: {
  gameId: string;
  matchId: string;
  size?: 'sm' | 'md';
}) => {
  const { t } = useTranslation();
  return (
    <Link
      to={livePlayPath(gameId, matchId)}
      aria-label={t('gameDetails.liveScorePlay')}
      title={t('gameDetails.liveScorePlay')}
      className={`${LIVE_BUTTON_CLASS} ${size === 'sm' ? 'h-9 w-9' : 'h-11 w-11'}`}
      onClick={stop}
    >
      <Play className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} strokeWidth={2} />
    </Link>
  );
};

/** Shown in place of empty 0:0 tiles once both sides are complete. */
export const EnterScoreRow = ({
  onEnterScore,
  liveGameId,
  matchId,
}: {
  onEnterScore: () => void;
  liveGameId?: string | null;
  matchId: string;
}) => {
  const { t } = useTranslation();
  return (
    <div className="mt-2 flex items-center gap-2" onClick={stop}>
      <button
        type="button"
        onClick={onEnterScore}
        className="inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary-600 px-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 active:scale-[0.98]"
      >
        <PenLine size={16} aria-hidden />
        <span className="truncate">{t('gameResults.enterScore')}</span>
      </button>
      {liveGameId ? <LivePlayLink gameId={liveGameId} matchId={matchId} /> : null}
    </div>
  );
};
