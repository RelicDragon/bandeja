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

export interface ScheduleBannerDay {
  /** Short display label of the date ("Wed 12 Aug"), used when the week view names days. */
  label: string;
  data: ClubScheduleResponseV2 | undefined;
}

/**
 * Day view passes one day; week view passes all seven and every banner covers the whole week
 * (naming the affected days), since the week grid shows one court and can't outline the rest.
 */
export function ScheduleBanners({
  days,
  week,
  integrationType,
  courtsHref,
  canEditCourts,
  isToday,
  syncing,
}: {
  days: ScheduleBannerDay[];
  week: boolean;
  integrationType: string | null;
  courtsHref: string;
  canEditCourts: boolean;
  /** Day view only: the shown day is today. */
  isToday: boolean;
  /** The console is refreshing provider snapshots for the shown dates right now. */
  syncing: boolean;
}) {
  const { t } = useTranslation('clubAdmin');
  const loaded = days.filter((d): d is ScheduleBannerDay & { data: ClubScheduleResponseV2 } => !!d.data);
  if (loaded.length === 0) return null;
  const items: React.ReactNode[] = [];
  const integrated = !!integrationType;
  const labels = (pick: (d: ClubScheduleResponseV2) => boolean) => loaded.filter((d) => pick(d.data)).map((d) => d.label);

  const failedDays = labels((d) => !!d.externalSlotsFailed);
  // `isLoadingExternalSlots` only means "snapshot older than the freshness window" — it turns
  // true a minute after every sync, so it can't drive the banner; the console's own refresh does.
  const missingDays = labels((d) => d.hasSnapshotForDate === false);
  if (failedDays.length > 0) {
    items.push(
      <Banner key="failed" tone="warn" icon={<CloudOff className="h-3.5 w-3.5" aria-hidden />}>
        {week ? t('sync.failedDays', { days: failedDays.join(', ') }) : t('sync.failed')}
      </Banner>
    );
  } else if (syncing) {
    items.push(
      <Banner key="loading" tone="info" icon={<Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}>
        {t('sync.updating')}
      </Banner>
    );
  } else if (integrated && missingDays.length > 0) {
    items.push(
      <Banner key="nosync" tone="warn" icon={<RefreshCcw className="h-3.5 w-3.5" aria-hidden />}>
        {week
          ? t('sync.noSyncDays', { days: missingDays.join(', ') })
          : isToday
            ? t('sync.noSyncToday')
            : t('sync.noSyncDay')}
      </Banner>
    );
  }
  // Club-wide mapping state: the worst day is the current truth.
  const unmapped = Math.max(...loaded.map((d) => d.data.unmappedExternalCourtCount ?? 0));
  if (unmapped > 0) {
    items.push(
      <Banner key="unmapped" tone="warn" icon={<AlertTriangle className="h-3.5 w-3.5" aria-hidden />}>
        {t('sync.unmapped', { count: unmapped })}{' '}
        {canEditCourts ? (
          <Link to={courtsHref} className="underline underline-offset-2">
            {t('sync.manageCourts')}
          </Link>
        ) : null}
      </Banner>
    );
  }
  // A conflict crossing midnight can be reported by both days: count it once.
  const conflictKeys = new Set<string>();
  const conflictDays: string[] = [];
  for (const d of loaded) {
    let fresh = false;
    for (const c of d.data.conflicts) {
      const key = `${c.courtId}|${c.startTime}|${c.endTime}`;
      if (!conflictKeys.has(key)) fresh = true;
      conflictKeys.add(key);
    }
    if (fresh) conflictDays.push(d.label);
  }
  if (conflictKeys.size > 0) {
    items.push(
      <Banner key="conflicts" tone="danger" icon={<AlertTriangle className="h-3.5 w-3.5" aria-hidden />}>
        {week
          ? t('sync.conflictsDays', { count: conflictKeys.size, days: conflictDays.join(', ') })
          : t('sync.conflicts', { count: conflictKeys.size })}
      </Banner>
    );
  }
  // Oldest snapshot across the shown days: "last synced" must not overstate freshness.
  const fetched = loaded.map((d) => d.data.snapshotFetchedAt).filter((v): v is string => !!v);
  const oldest = fetched.length === loaded.length && fetched.length > 0 ? fetched.reduce((a, b) => (a < b ? a : b)) : null;
  const synced =
    integrated && !syncing && oldest ? t('sync.lastSync', { time: formatRelativeTime(oldest) }) : null;

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
