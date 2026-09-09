import { CalendarCheck2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { clubHasBookingIntegration, type ClubIntegrationRef } from '@shared/clubIntegration';

interface ClubBookingBadgeProps {
  club: ClubIntegrationRef & { canBookInApp?: boolean };
  onColor?: boolean;
  className?: string;
}

export function ClubBookingBadge({ club, onColor = false, className = '' }: ClubBookingBadgeProps) {
  const { t } = useTranslation();
  if (!(club.canBookInApp ?? clubHasBookingIntegration(club))) return null;

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4 ring-1 ring-inset ${
        onColor
          ? 'bg-white/15 text-white ring-white/30'
          : 'bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20'
      } ${className}`}
      title={t('club.bookInApp')}
    >
      <CalendarCheck2 className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
      <span>{t('club.bookInApp')}</span>
    </span>
  );
}
