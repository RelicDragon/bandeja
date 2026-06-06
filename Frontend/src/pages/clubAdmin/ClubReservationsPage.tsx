import { useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { ClubAdminReservationRow } from '@/components/clubAdmin/ClubAdminReservationRow';
import { useClubAdminScrollContainer } from '@/components/clubAdmin/ClubAdminScrollContext';
import { useClubAdminForbidden } from '@/hooks/useClubAdminForbidden';
import { useClubAdminReservations } from '@/hooks/useClubAdminReservations';
import { useClubAdminScreen } from '@/clubAdmin/useClubAdminShell';

export function ClubReservationsPage() {
  const { clubId } = useParams<{ clubId: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const handleForbidden = useClubAdminForbidden();
  const scrollRef = useClubAdminScrollContainer();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { items, loading, initialLoading, hasMore, error, loadMore } = useClubAdminReservations(
    clubId,
    handleForbidden
  );

  useClubAdminScreen({
    title: t('clubAdmin.reservations'),
    backTo: `/my-clubs/${clubId}`,
  });

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const root = scrollRef?.current ?? null;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loading) void loadMore();
      },
      { root, rootMargin: '120px', threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollRef, hasMore, loading, loadMore, items.length]);

  if (!clubId) return null;

  return (
    <div className="mx-auto max-w-lg space-y-2 pb-4">
      {initialLoading && (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
        </div>
      )}

      {!initialLoading && error && items.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('clubAdmin.reservationsLoadFailed')}</p>
      )}

      {!initialLoading && !error && items.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('clubAdmin.noReservations')}</p>
      )}

      {items.map((item) => (
        <ClubAdminReservationRow
          key={item.id}
          item={item}
          onClick={() => {
            const date = format(new Date(item.startTime), 'yyyy-MM-dd');
            navigate(`/my-clubs/${clubId}/schedule?date=${date}`);
          }}
        />
      ))}

      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-4">
          {loading && <Loader2 className="h-6 w-6 animate-spin text-primary-600" />}
        </div>
      )}
    </div>
  );
}
