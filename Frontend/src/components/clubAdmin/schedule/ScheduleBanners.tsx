/**
 * Booking-provider sync status (same states as the former BooktimeScheduleStatus) + conflicts,
 * restyled as compact console banners. Legend explains the pattern/colour of each kind.
 */
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CloudOff, Loader2, RefreshCcw } from 'lucide-react';
import type { ClubScheduleResponseV2 } from '@shared/clubAdmin/contract';
import { formatRelativeTime } from '@/utils/dateFormat';
import { VISUAL_CLASS, type BookingVisual } from '../console/bookingText';
import { cx } from '../console/classes';

function Banner({ tone, icon, children }: { tone: 'warn' | 'info' | 'danger'; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className={cx(
        'flex items-start gap-2 rounded-xl px-3 py-2 text-xs font-medium',
        tone === 'warn' && 'bg-ca-warn-bg text-ca-warn',
        tone === 'danger' && 'bg-ca-danger-bg text-destructive',
        tone === 'info' && 'bg-ca-sunken text-muted-foreground'
      )}
    >
      <span className="mt-px shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function ScheduleBanners({
  data,
  integrationType,
  courtsHref,
  canEditCourts,
  isToday,
  syncing,
  missingDays,
}: {
  data: ClubScheduleResponseV2 | undefined;
  integrationType: string | null;
  courtsHref: string;
  canEditCourts: boolean;
  isToday: boolean;
  /** The console is refreshing the provider snapshot for this date right now. */
  syncing: boolean;
  /** Week view: labels of the days that have no provider snapshot (replaces `data.hasSnapshotForDate`). */
  missingDays?: string[];
}) {
  const { t } = useTranslation('clubAdmin');
  if (!data) return null;
  const items: React.ReactNode[] = [];
  const integrated = !!integrationType;

  if (data.externalSlotsFailed) {
    items.push(
      <Banner key="failed" tone="warn" icon={<CloudOff className="h-3.5 w-3.5" aria-hidden />}>
        {t('sync.failed')}
      </Banner>
    );
  } else if (syncing) {
    items.push(
      <Banner key="loading" tone="info" icon={<Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}>
        {t('sync.updating')}
      </Banner>
    );
  } else if (integrated && missingDays && missingDays.length > 0) {
    items.push(
      <Banner key="nosync" tone="warn" icon={<RefreshCcw className="h-3.5 w-3.5" aria-hidden />}>
        {t('sync.noSyncDays', { days: missingDays.join(', ') })}
      </Banner>
    );
  } else if (integrated && !missingDays && data.hasSnapshotForDate === false) {
    // `isLoadingExternalSlots` only means "snapshot older than the freshness window" — it turns
    // true a minute after every sync, so it can't drive the banner; the console's own refresh does.
    items.push(
      <Banner key="nosync" tone="warn" icon={<RefreshCcw className="h-3.5 w-3.5" aria-hidden />}>
        {isToday ? t('sync.noSyncToday') : t('sync.noSyncDay')}
      </Banner>
    );
  }
  if ((data.unmappedExternalCourtCount ?? 0) > 0) {
    items.push(
      <Banner key="unmapped" tone="warn" icon={<AlertTriangle className="h-3.5 w-3.5" aria-hidden />}>
        {t('sync.unmapped', { count: data.unmappedExternalCourtCount ?? 0 })}{' '}
        {canEditCourts ? (
          <Link to={courtsHref} className="underline underline-offset-2">
            {t('sync.manageCourts')}
          </Link>
        ) : null}
      </Banner>
    );
  }
  if (data.conflicts.length > 0) {
    items.push(
      <Banner key="conflicts" tone="danger" icon={<AlertTriangle className="h-3.5 w-3.5" aria-hidden />}>
        {t('sync.conflicts', { count: data.conflicts.length })}
      </Banner>
    );
  }
  const synced =
    integrated && !data.externalSlotsFailed && !syncing && data.snapshotFetchedAt
      ? t('sync.lastSync', { time: formatRelativeTime(data.snapshotFetchedAt) })
      : null;

  if (items.length === 0 && !synced) return null;
  return (
    <div className="space-y-1.5 px-2 pt-2 lg:px-4">
      {items}
      {synced && items.length === 0 ? <p className="px-1 text-[11px] text-muted-foreground">{synced}</p> : null}
    </div>
  );
}

const LEGEND: BookingVisual[] = ['game', 'planned', 'hold', 'external', 'unassigned'];

export function ScheduleLegend({ className }: { className?: string }) {
  const { t } = useTranslation('clubAdmin');
  return (
    <ul className={cx('ca-no-scrollbar flex gap-3 overflow-x-auto text-[11px] text-muted-foreground', className)} aria-label={t('schedule.legend')}>
      {LEGEND.map((v) => (
        <li key={v} className="flex shrink-0 items-center gap-1.5">
          <span className={cx('h-3 w-5 rounded', VISUAL_CLASS[v])} aria-hidden />
          {t(`schedule.kindLabel.${v}`)}
        </li>
      ))}
    </ul>
  );
}
