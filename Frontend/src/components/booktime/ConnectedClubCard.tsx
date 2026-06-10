import { useTranslation } from 'react-i18next';
import { Check, Loader2 } from 'lucide-react';
import type { BooktimeMyClubRow } from '@/api/booktime';
import { ClubAvatar } from '@/components';
import { ClubBookingsBlock } from './ClubBookingsBlock';

type Props = {
  club: BooktimeMyClubRow;
  disconnectBusy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onBookingsChanged: () => void;
};

export function ConnectedClubCard({
  club,
  disconnectBusy,
  onConnect,
  onDisconnect,
  onBookingsChanged,
}: Props) {
  const { t } = useTranslation();

  return (
    <article
      className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition-shadow dark:bg-gray-900 ${
        club.connected
          ? 'border-emerald-200/80 dark:border-emerald-900/50'
          : 'border-gray-200/90 dark:border-gray-700/90 hover:shadow-md'
      }`}
    >
      <div className="flex items-start gap-3 p-4">
        <ClubAvatar
          club={{ id: club.clubId, name: club.clubName, avatar: club.avatar }}
          variant="card"
          className="h-16 w-16 shrink-0"
        />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-start justify-between gap-2">
            <h2 className="font-semibold text-gray-900 dark:text-white leading-snug">{club.clubName}</h2>
            {club.connected ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
                <Check size={12} strokeWidth={2.5} aria-hidden />
                {t('club.booktime.connectedBadge')}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {t('club.courtsCount', { count: club.courts.length })}
          </p>
          {club.connected && club.phoneNumber ? (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t('club.booktime.connectedAs', { phone: club.phoneNumber })}
            </p>
          ) : null}
          {club.connected ? (
            <button
              type="button"
              disabled={disconnectBusy}
              onClick={onDisconnect}
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
            >
              {disconnectBusy ? <Loader2 className="animate-spin shrink-0" size={14} /> : null}
              {t('club.booktime.disconnect')}
            </button>
          ) : (
            <button
              type="button"
              onClick={onConnect}
              className="mt-2 text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
            >
              {t('club.booktime.connectCta')}
            </button>
          )}
        </div>
      </div>

      {club.connected ? <ClubBookingsBlock club={club} onChanged={onBookingsChanged} /> : null}
    </article>
  );
}
