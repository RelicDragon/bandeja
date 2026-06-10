import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BooktimeSnapshotBanner } from '@/hooks/useBooktimeSnapshotRefresh';

type Props = {
  loading?: boolean;
  banner: BooktimeSnapshotBanner;
};

export function BooktimeAvailabilityBanner({ loading, banner }: Props) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/40 px-3 py-2 text-xs text-gray-600 dark:text-gray-400">
        <Loader2 size={14} className="animate-spin shrink-0" aria-hidden />
        {t('club.booktime.updatingAvailability')}
      </div>
    );
  }
  if (banner === 'noSyncToday') {
    return (
      <p className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50/80 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
        {t('club.booktime.noSyncToday')}
      </p>
    );
  }
  if (banner === 'scoutPoolEmpty') {
    return (
      <p className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50/80 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
        {t('club.booktime.scoutPoolEmpty')}
      </p>
    );
  }
  return null;
}
