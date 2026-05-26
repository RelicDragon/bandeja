import { useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ImageDown, Loader2, Pencil, RotateCcw, Send } from 'lucide-react';
import { leaguesApi } from '@/api/leagues';
import { bracketNotifySummaryErrorMessage } from '@/utils/bracketApiError.util';
import { useIsAppOffline } from '@/utils/bracketOffline.util';
import { exportBracketContainerPng } from '@/utils/leagueBracketShare.util';

interface BracketShareToolbarProps {
  leagueSeasonId: string;
  bracketRoundId?: string;
  groupId?: string | null;
  exportTargetRef: RefObject<HTMLElement | null>;
  canNotifySummary?: boolean;
  canEditBracket?: boolean;
  onEditBracket?: () => void;
  canRestartPlayoff?: boolean;
  restartingPlayoff?: boolean;
  onRestartPlayoff?: () => void;
  className?: string;
}

const btn =
  'inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/60 disabled:cursor-not-allowed disabled:opacity-50';

const btnGhost =
  `${btn} border border-gray-200/90 bg-white/90 text-gray-800 shadow-sm hover:bg-gray-50 dark:border-gray-600/80 dark:bg-gray-800/70 dark:text-gray-100 dark:hover:bg-gray-700/80`;

const btnDanger =
  `${btn} border border-red-300/80 bg-red-50/90 text-red-800 shadow-sm hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/60`;

export function BracketShareToolbar({
  leagueSeasonId,
  bracketRoundId,
  groupId,
  exportTargetRef,
  canNotifySummary = false,
  canEditBracket = false,
  onEditBracket,
  canRestartPlayoff = false,
  restartingPlayoff = false,
  onRestartPlayoff,
  className = '',
}: BracketShareToolbarProps) {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const offline = useIsAppOffline();

  const guardOffline = (): boolean => {
    if (!offline) return false;
    toast.error(t('gameDetails.bracketOfflineAction'));
    return true;
  };

  const handleExport = async () => {
    if (guardOffline()) return;
    const el = exportTargetRef.current;
    if (!el) return;
    setExporting(true);
    try {
      await exportBracketContainerPng(el);
      toast.success(t('gameDetails.bracketExportDone'));
    } catch {
      toast.error(t('gameDetails.bracketExportFailed'));
    } finally {
      setExporting(false);
    }
  };

  const handleNotifySummary = async () => {
    if (guardOffline()) return;
    setNotifying(true);
    try {
      const res = await leaguesApi.notifyBracketSummary(leagueSeasonId, {
        roundId: bracketRoundId,
        leagueGroupId: groupId ?? undefined,
      });
      const count = res.data?.notifiedUsers ?? 0;
      toast.success(t('gameDetails.bracketNotifySummaryDone', { count }));
    } catch (err) {
      toast.error(bracketNotifySummaryErrorMessage(err, t));
    } finally {
      setNotifying(false);
    }
  };

  const offlineTitle = offline ? t('gameDetails.bracketOfflineAction') : undefined;

  return (
    <div
      className={`grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 ${className}`.trim()}
      role="toolbar"
      aria-label={t('gameDetails.bracketActionsToolbar', { defaultValue: 'Bracket actions' })}
    >
      {canNotifySummary ? (
        <button
          type="button"
          onClick={() => void handleNotifySummary()}
          disabled={notifying || offline}
          title={offlineTitle}
          className={btnGhost}
        >
          {notifying ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
          ) : (
            <Send className="h-3.5 w-3.5 shrink-0" aria-hidden />
          )}
          <span className="truncate">{t('gameDetails.bracketNotifySummary')}</span>
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => void handleExport()}
        disabled={exporting || offline}
        title={offlineTitle}
        className={btnGhost}
      >
        {exporting ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
        ) : (
          <ImageDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
        )}
        <span className="truncate">{t('gameDetails.bracketExportImage')}</span>
      </button>
      {canEditBracket && onEditBracket ? (
        <button
          type="button"
          disabled={offline}
          title={offlineTitle}
          onClick={onEditBracket}
          className={btnGhost}
        >
          <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{t('gameDetails.bracketEditButton')}</span>
        </button>
      ) : null}
      {canRestartPlayoff && onRestartPlayoff ? (
        <button
          type="button"
          disabled={restartingPlayoff || offline}
          title={offlineTitle}
          onClick={onRestartPlayoff}
          className={`${btnDanger} col-span-2 sm:col-span-1`}
        >
          <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {restartingPlayoff
              ? t('common.loading')
              : t('gameDetails.restartPlayoff', { defaultValue: 'Restart Playoff' })}
          </span>
        </button>
      ) : null}
    </div>
  );
}
