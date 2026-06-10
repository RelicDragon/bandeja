import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatRelativeTime } from '@/utils/dateFormat';

type Props = {
  clubId: string;
  isLoadingExternalSlots: boolean;
  externalSlotsFailed?: boolean;
  snapshotFetchedAt?: string | null;
  hasSnapshotForDate?: boolean;
  unmappedExternalCourtCount?: number;
};

export function BooktimeScheduleStatus({
  clubId,
  isLoadingExternalSlots,
  externalSlotsFailed,
  snapshotFetchedAt,
  hasSnapshotForDate,
  unmappedExternalCourtCount = 0,
}: Props) {
  const { t } = useTranslation();

  return (
    <div className="mb-2 space-y-2">
      {externalSlotsFailed ? (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          {t('clubAdmin.integrationDown')}
        </p>
      ) : null}
      {isLoadingExternalSlots ? (
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/40 px-3 py-2 text-xs text-gray-600 dark:text-gray-400">
          <Loader2 size={14} className="animate-spin shrink-0" aria-hidden />
          {t('club.booktime.updatingAvailability')}
        </div>
      ) : !hasSnapshotForDate ? (
        <p className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50/80 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
          {t('club.booktime.noSyncToday')}
        </p>
      ) : snapshotFetchedAt ? (
        <p className="text-xs text-muted-foreground px-1">
          {t('club.booktime.lastSync', { time: formatRelativeTime(snapshotFetchedAt) })}
        </p>
      ) : null}
      {unmappedExternalCourtCount > 0 ? (
        <div className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50/80 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-900 dark:text-amber-100 space-y-1">
          <p>{t('clubAdmin.booktimeUnmappedCourts', { count: unmappedExternalCourtCount })}</p>
          <p className="text-amber-800/90 dark:text-amber-200/90">{t('clubAdmin.booktimeUnmappedImportHint')}</p>
          <Link
            to={`/my-clubs/${clubId}/courts`}
            className="inline-block font-medium text-primary-600 dark:text-primary-400 hover:underline"
          >
            {t('clubAdmin.booktimeManageCourtsLink')}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
