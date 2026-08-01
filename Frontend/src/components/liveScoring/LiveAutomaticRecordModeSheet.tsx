import { useTranslation } from 'react-i18next';
import type { LiveAutomaticRecordMode } from '@/utils/liveScoring';

type Props = {
  open: boolean;
  onChoose: (mode: LiveAutomaticRecordMode) => void;
  disabled?: boolean;
};

export function LiveAutomaticRecordModeSheet({ open, onChoose, disabled = false }: Props) {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-3 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal
        className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
      >
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
          {t('gameDetails.liveScoring.automaticRecordTitle')}
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          {t('gameDetails.liveScoring.automaticRecordSubtitle')}
        </p>
        <div className="mt-5 flex flex-col gap-2.5">
          <button
            type="button"
            disabled={disabled}
            className="rounded-xl border border-primary-500/40 bg-primary-500/10 px-4 py-3 text-left text-sm font-medium text-primary-950 hover:bg-primary-500/15 disabled:opacity-50 dark:text-primary-50"
            onClick={() => onChoose('GAMES')}
          >
            {t('gameDetails.liveScoring.automaticRecordGamesCta')}
          </button>
          <button
            type="button"
            disabled={disabled}
            className="rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-left text-sm font-medium text-gray-900 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
            onClick={() => onChoose('AMERICANO_POINTS')}
          >
            {t('gameDetails.liveScoring.automaticRecordAmericanoCta')}
          </button>
        </div>
      </div>
    </div>
  );
}
