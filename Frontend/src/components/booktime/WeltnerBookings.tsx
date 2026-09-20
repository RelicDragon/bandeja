import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ConnectedBookingClubRow } from '@/hooks/connectedBookingClubs';
import { weltnerApi, type WeltnerReceipt } from '@/api/weltner';
import { useAuthStore } from '@/store/authStore';

export function WeltnerBookings({
  club,
  refreshKey,
}: {
  club: ConnectedBookingClubRow;
  refreshKey: number;
}) {
  const { t, i18n } = useTranslation();
  const userId = useAuthStore((state) => state.user?.id);
  const requestKey = JSON.stringify([userId, club.clubId, club.connected, refreshKey]);
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<WeltnerReceipt[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    setReceipts([]);
    if (!userId) {
      setLoading(false);
      return;
    }
    void weltnerApi
      .bookings(club.clubId)
      .then((rows) => {
        if (active) setReceipts(club.connected ? rows.filter(r => r.state !== 'CONFIRMED') : rows);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) {
          setResolvedKey(requestKey);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [userId, club.clubId, club.connected, requestKey]);
  const pending = loading || resolvedKey !== requestKey;
  if (!userId || (club.connected && !pending && !error && receipts.length === 0)) return null;
  return (
    <section className="rounded-xl border border-gray-200 p-4 space-y-3 dark:border-gray-700">
      <h3 className="font-semibold">{club.clubName} · Weltner</h3>
      <p className="text-sm text-gray-500">{t('weltner.receiptsHint')}</p>
      {pending ? (
        <p>{t('weltner.loading')}</p>
      ) : error ? (
        <p role="alert">{t('weltner.loadFailed')}</p>
      ) : receipts.length === 0 ? (
        <p>{t('weltner.noReceipts')}</p>
      ) : (
        receipts.map((r) => {
          const date = new Intl.DateTimeFormat(i18n.language, {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: club.cityTimezone || 'Europe/Belgrade',
          }).format(new Date(r.bookingStart));
          const params = new URLSearchParams({
            clubId: club.clubId,
            courtId: r.courtId,
            startTime: r.bookingStart,
            endTime: r.bookingEnd,
            bookingIds: r.externalBookingId,
          });
          return (
            <div key={r.externalBookingId} className="border-t pt-3 space-y-1 text-sm">
              <p>
                {club.courts.find((c) => c.id === r.courtId)?.name} · {date}
              </p>
              <p>{t(r.state === 'CONFIRMED' ? 'weltner.confirmed' : 'weltner.bookingUnknown')}</p>
              {r.state === 'CONFIRMED' && new Date(r.bookingStart) > new Date() && (
                <Link
                  to={`/create-game?${params}`}
                  state={{ entityType: 'GAME' }}
                  className="text-primary-600 underline"
                >
                  {t('weltner.useReceipt')}
                </Link>
              )}
            </div>
          );
        })
      )}
    </section>
  );
}
