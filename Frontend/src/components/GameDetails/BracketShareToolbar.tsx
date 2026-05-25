import { useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ImageDown, Link2, Loader2, Send } from 'lucide-react';
import { leaguesApi } from '@/api/leagues';
import { bracketNotifySummaryErrorMessage } from '@/utils/bracketApiError.util';
import { useIsAppOffline } from '@/utils/bracketOffline.util';
import {
  buildLeagueBracketShareUrl,
  copyTextToClipboard,
  exportBracketContainerPng,
} from '@/utils/leagueBracketShare.util';

interface BracketShareToolbarProps {
  leagueSeasonId: string;
  bracketRoundId?: string;
  groupId?: string | null;
  exportTargetRef: RefObject<HTMLElement | null>;
  canNotifySummary?: boolean;
}

const btnBase =
  'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60';

export function BracketShareToolbar({
  leagueSeasonId,
  bracketRoundId,
  groupId,
  exportTargetRef,
  canNotifySummary = false,
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

  const handleShare = async () => {
    if (guardOffline()) return;
    const url = buildLeagueBracketShareUrl(leagueSeasonId, {
      roundId: bracketRoundId,
      groupId: groupId ?? undefined,
    });
    const ok = await copyTextToClipboard(url);
    if (ok) toast.success(t('gameDetails.bracketShareCopied'));
    else toast.error(t('gameDetails.bracketShareCopyFailed'));
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

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {canNotifySummary ? (
        <button
          type="button"
          onClick={() => void handleNotifySummary()}
          disabled={notifying || offline}
          title={offline ? t('gameDetails.bracketOfflineAction') : undefined}
          className={`${btnBase} border border-indigo-200 bg-indigo-50 text-indigo-900 shadow-sm hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-100 dark:hover:bg-indigo-950/70`}
        >
          {notifying ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Send className="h-3.5 w-3.5" aria-hidden />
          )}
          {t('gameDetails.bracketNotifySummary')}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => void handleExport()}
        disabled={exporting || offline}
        title={offline ? t('gameDetails.bracketOfflineAction') : undefined}
        className={`${btnBase} border border-gray-300 bg-transparent text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800/80`}
      >
        {exporting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <ImageDown className="h-3.5 w-3.5" aria-hidden />
        )}
        {t('gameDetails.bracketExportImage')}
      </button>
      <button
        type="button"
        onClick={() => void handleShare()}
        disabled={offline}
        title={offline ? t('gameDetails.bracketOfflineAction') : undefined}
        className={`${btnBase} border border-primary-600 bg-primary-600 text-white shadow-sm hover:bg-primary-700 dark:border-primary-500 dark:bg-primary-600 dark:hover:bg-primary-500`}
      >
        <Link2 className="h-3.5 w-3.5" aria-hidden />
        {t('gameDetails.bracketShare')}
      </button>
    </div>
  );
}
