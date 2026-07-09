import { AlertTriangle, CheckCircle2, Info, Link2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { EditReservationAction, ReservationIntent } from '@shared/gameBooking/reservationIntent';
import type { Club } from '@/types';

type ReservationSummaryCardProps = {
  intent: ReservationIntent;
  requiredCount: number;
  selectedBookingCount: number;
};

type EditReservationConsequenceSummaryProps = {
  action: EditReservationAction;
  linkedCount: number;
  selectedBookingCount: number;
  willReserveNew: boolean;
  pendingUnlinkCount: number;
  club?: Club;
};

function PolicyBlock({ club }: { club?: Club }) {
  const { t } = useTranslation();
  if (!club?.policyText?.trim() && !club?.cancellationNoticeHours) return null;

  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-100">
      {club.cancellationNoticeHours != null && club.cancellationNoticeHours > 0 ? (
        <p>{t('createGame.clubCancellationNotice', { hours: club.cancellationNoticeHours })}</p>
      ) : null}
      {club.policyText?.trim() ? (
        <div className="mt-1">
          <p className="font-semibold">{t('createGame.clubPolicyTitle')}</p>
          <p className="mt-0.5 whitespace-pre-wrap">{club.policyText.trim()}</p>
        </div>
      ) : null}
    </div>
  );
}

export function ReservationSummaryCard({
  intent,
  requiredCount,
  selectedBookingCount,
}: ReservationSummaryCardProps) {
  const { t } = useTranslation();
  const icon =
    intent === 'reserveNow' ? CheckCircle2 : intent === 'useExisting' ? Link2 : Info;

  const Icon = icon;
  return (
    <section className="rounded-lg border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-800 dark:bg-gray-900/70">
      <div className="flex gap-3">
        <Icon size={18} className="mt-0.5 shrink-0 text-primary-600 dark:text-primary-300" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {t(`createGame.reservationIntent.summary.${intent}.title`)}
          </p>
          <p className="mt-1 text-xs leading-snug text-gray-600 dark:text-gray-400">
            {t(`createGame.reservationIntent.summary.${intent}.body`, {
              count: requiredCount,
              selected: selectedBookingCount,
            })}
          </p>
        </div>
      </div>
    </section>
  );
}

export function EditReservationConsequenceSummary({
  action,
  linkedCount,
  selectedBookingCount,
  willReserveNew,
  pendingUnlinkCount,
  club,
}: EditReservationConsequenceSummaryProps) {
  const { t } = useTranslation();
  const destructive = action === 'unlink' || action === 'gameOnly' || pendingUnlinkCount > 0;

  return (
    <section
      className={`rounded-lg border p-3 ${
        destructive
          ? 'border-amber-200 bg-amber-50/80 dark:border-amber-800/70 dark:bg-amber-950/30'
          : 'border-gray-200 bg-gray-50/80 dark:border-gray-800 dark:bg-gray-900/70'
      }`}
    >
      <div className="flex gap-3">
        {destructive ? (
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" />
        ) : (
          <Info size={18} className="mt-0.5 shrink-0 text-primary-600 dark:text-primary-300" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {t('gameDetails.locationTime.consequenceTitle')}
          </p>
          <ul className="mt-1 space-y-1 text-xs leading-snug text-gray-600 dark:text-gray-400">
            <li>
              {t(`gameDetails.locationTime.consequence.${action}`, {
                linked: linkedCount,
                selected: selectedBookingCount,
              })}
            </li>
            {willReserveNew ? (
              <li>{t('gameDetails.locationTime.consequence.reserveNewConfirm')}</li>
            ) : null}
            {pendingUnlinkCount > 0 ? (
              <li>
                {t('gameDetails.locationTime.consequence.unlinkNoCancel', {
                  count: pendingUnlinkCount,
                })}
              </li>
            ) : null}
          </ul>
          {destructive ? <PolicyBlock club={club} /> : null}
        </div>
      </div>
    </section>
  );
}
