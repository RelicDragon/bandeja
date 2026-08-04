import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import type { ConnectedBookingClubRow } from '@/hooks/connectedBookingClubs';
import { ClubAvatar } from '@/components';

type Props = {
  club: ConnectedBookingClubRow;
  disconnectBusy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
};

export function ConnectedClubCard({
  club,
  disconnectBusy,
  onConnect,
  onDisconnect,
}: Props) {
  const { t } = useTranslation();
  const providerLabel =
    club.integrationType === 'PADELOO'
      ? t('club.padeloo.providerLabel', { defaultValue: 'Padeloo' })
      : club.integrationType === 'KLIKTEREN'
        ? t('club.klikteren.providerLabel', { defaultValue: 'Klikteren' })
        : t('club.booktime.providerLabel', { defaultValue: 'Booktime' });

  const needsReauth = club.needsReauth;
  const isActive = club.connected && !needsReauth;

  return (
    <article
      className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition-shadow dark:bg-gray-900 ${
        needsReauth
          ? 'border-amber-300/90 dark:border-amber-800/70'
          : isActive
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
            {needsReauth ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
                <AlertTriangle size={12} strokeWidth={2.5} aria-hidden />
                {t('club.booktime.needsReauthBadge')}
              </span>
            ) : isActive ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
                <Check size={12} strokeWidth={2.5} aria-hidden />
                {t('club.booktime.connectedBadge')}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {providerLabel} · {t('club.courtsCount', { count: club.courts.length })}
          </p>
          {needsReauth ? (
            <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-200/90">
              {t('club.booktime.needsReauthHint')}
            </p>
          ) : null}
          {isActive && club.phoneNumber ? (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t('club.booktime.connectedAs', { phone: club.phoneNumber })}
            </p>
          ) : null}
          {isActive && club.email ? (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t('club.padeloo.connectedAs', { email: club.email, defaultValue: club.email })}
            </p>
          ) : null}
          {needsReauth ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <button
                type="button"
                onClick={onConnect}
                className="text-sm font-semibold text-amber-700 hover:underline dark:text-amber-300"
              >
                {t('club.booktime.reauthorizeCta')}
              </button>
              <button
                type="button"
                disabled={disconnectBusy}
                onClick={onDisconnect}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:underline disabled:opacity-50 dark:text-gray-400"
              >
                {disconnectBusy ? <Loader2 className="animate-spin shrink-0" size={14} /> : null}
                {t('club.booktime.removeConnection')}
              </button>
            </div>
          ) : isActive ? (
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
    </article>
  );
}
