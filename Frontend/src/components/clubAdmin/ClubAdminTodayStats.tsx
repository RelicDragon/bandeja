import { AlertTriangle, CalendarCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ClubAdminTodayStatsProps {
  slots: number;
  conflicts: number;
}

export function ClubAdminTodayStats({ slots, conflicts }: ClubAdminTodayStatsProps) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-2xl border border-border bg-white p-4 dark:bg-gray-900">
        <div className="flex items-center gap-2 text-muted-foreground">
          <CalendarCheck className="h-4 w-4" />
          <span className="text-xs font-medium uppercase tracking-wide">{t('clubAdmin.schedule')}</span>
        </div>
        <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{slots}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('clubAdmin.statsScheduledToday')}</p>
      </div>
      <div
        className={`rounded-2xl border p-4 ${
          conflicts > 0 ? 'border-amber-500/30 bg-amber-500/5' : 'border-border bg-white dark:bg-gray-900'
        }`}
      >
        <div
          className={`flex items-center gap-2 ${
            conflicts > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
          <span className="text-xs font-medium uppercase tracking-wide">{t('clubAdmin.statsConflictsLabel')}</span>
        </div>
        <p
          className={`mt-2 text-3xl font-bold tabular-nums ${
            conflicts > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-foreground'
          }`}
        >
          {conflicts}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {conflicts > 0
            ? t('clubAdmin.conflicts', { count: conflicts })
            : t('clubAdmin.statsNoConflicts')}
        </p>
      </div>
    </div>
  );
}
