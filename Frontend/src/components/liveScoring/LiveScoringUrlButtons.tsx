import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

type LiveScoringUrlButtonsProps = {
  tvUrl: string;
  broadcastUrl: string;
};

export function LiveScoringUrlButtons({ tvUrl, broadcastUrl }: LiveScoringUrlButtonsProps) {
  const { t } = useTranslation();

  const copy = async (url: string) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t('gameDetails.linkCopied'));
    } catch {
      toast.error(t('gameDetails.copyError'));
    }
  };

  const btn =
    'flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-center text-xs font-semibold text-gray-900 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800';

  return (
    <div className="flex w-full shrink-0 gap-2 border-t border-gray-200 bg-gray-50/95 px-3 py-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-950/95">
      <button type="button" className={btn} disabled={!tvUrl} onClick={() => void copy(tvUrl)}>
        {t('gameDetails.liveScoreTv')}
      </button>
      <button type="button" className={btn} disabled={!broadcastUrl} onClick={() => void copy(broadcastUrl)}>
        {t('gameDetails.liveScoreBroadcast')}
      </button>
    </div>
  );
}
