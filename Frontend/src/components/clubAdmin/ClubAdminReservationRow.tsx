import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';
import { ClubAdminReservationItem } from '@/api/clubAdmin';

interface ClubAdminReservationRowProps {
  item: ClubAdminReservationItem;
  onClick: () => void;
}

function formatTimeRange(startTime: string, endTime: string) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  return `${format(start, 'HH:mm')}–${format(end, 'HH:mm')}`;
}

export function ClubAdminReservationRow({ item, onClick }: ClubAdminReservationRowProps) {
  const { t } = useTranslation();
  const start = new Date(item.startTime);

  const title =
    item.kind === 'hold'
      ? t(`clubAdmin.label.${item.label}`)
      : item.name || t('clubAdmin.gameTitle');

  const subtitle =
    item.kind === 'game'
      ? `${item.host.firstName ?? ''} ${item.host.lastName ?? ''}`.trim() ||
        t('clubAdmin.gameTitle')
      : item.note;

  const badge =
    item.kind === 'hold'
      ? t('clubAdmin.legend.hold')
      : item.hasBookedCourt
        ? t('clubAdmin.confirmed')
        : t('clubAdmin.planned');

  const badgeClass =
    item.kind === 'hold'
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
      : item.hasBookedCourt
        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
        : 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300';

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-2xl border border-border bg-white p-3 text-left transition-all active:scale-[0.98] hover:border-primary/20 dark:bg-gray-900"
    >
      <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-muted text-center">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {format(start, 'MMM')}
        </span>
        <span className="text-lg font-bold leading-none text-foreground">{format(start, 'd')}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold text-foreground">{title}</p>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badgeClass}`}>
            {badge}
          </span>
        </div>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">
          {format(start, 'EEE')} · {formatTimeRange(item.startTime, item.endTime)}
          {item.courtName ? ` · ${item.courtName}` : item.courtId ? '' : ` · ${t('clubAdmin.unassignedCourt')}`}
        </p>
        {subtitle && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}
