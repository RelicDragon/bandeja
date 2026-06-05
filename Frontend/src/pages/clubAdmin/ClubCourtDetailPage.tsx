import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { clubAdminApi, ScheduleSlot } from '@/api/clubAdmin';
import { ClubAdminLayout } from '@/components/clubAdmin/ClubAdminLayout';
import { ClubAdminCourtForm } from '@/components/clubAdmin/ClubAdminCourtForm';
import { CourtScheduleGrid } from '@/components/clubAdmin/CourtScheduleGrid';
import { useClubAdminSchedule } from '@/hooks/useClubAdminSchedule';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { RefreshIndicator } from '@/components/RefreshIndicator';
import { useClubAdminForbidden } from '@/hooks/useClubAdminForbidden';
import { Court } from '@/types';

export function ClubCourtDetailPage() {
  const { clubId, courtId } = useParams<{ clubId: string; courtId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation();
  const handleForbidden = useClubAdminForbidden();
  const date = searchParams.get('date') || format(new Date(), 'yyyy-MM-dd');
  const [court, setCourt] = useState<Court | null>(null);
  const [clubMeta, setClubMeta] = useState<{
    city?: { timezone?: string };
    openingTime?: string | null;
    closingTime?: string | null;
    defaultSlotMinutes?: number | null;
  }>({});
  const [formOpen, setFormOpen] = useState(false);

  const { data, loading, refetch } = useClubAdminSchedule(clubId!, date, courtId);
  const { isRefreshing, pullDistance, pullProgress } = usePullToRefresh({
    onRefresh: refetch,
    disabled: loading,
  });

  useEffect(() => {
    if (!clubId || !courtId) return;
    Promise.all([clubAdminApi.listCourts(clubId), clubAdminApi.getClub(clubId)])
      .then(([courts, club]) => {
        setCourt(courts.find((c) => c.id === courtId) ?? null);
        setClubMeta({
          city: club.city,
          openingTime: club.openingTime,
          closingTime: club.closingTime,
          defaultSlotMinutes: (club as { defaultSlotMinutes?: number | null }).defaultSlotMinutes,
        });
      })
      .catch(handleForbidden);
  }, [clubId, courtId, handleForbidden]);

  const slots = (data?.slots ?? []).filter((s: ScheduleSlot) => s.courtId === courtId);

  return (
    <ClubAdminLayout title={court?.name ?? t('clubAdmin.court')} backTo={`/my-clubs/${clubId}/courts`}>
      <RefreshIndicator isRefreshing={isRefreshing} pullDistance={pullDistance} pullProgress={pullProgress} />
      <button type="button" className="btn-secondary mb-3 w-full text-sm" onClick={() => setFormOpen(true)}>
        {t('clubAdmin.editCourt')}
      </button>
      <input
        type="date"
        className="mb-3 w-full rounded-lg border border-border bg-background px-3 py-2"
        value={date}
        onChange={(e) => setSearchParams({ date: e.target.value })}
      />
      {loading || !court ? (
        <p>{t('common.loading')}</p>
      ) : (
        <CourtScheduleGrid
          courts={[court]}
          slots={slots}
          scheduleDate={date}
          club={clubMeta}
          openingTime={clubMeta.openingTime}
          closingTime={clubMeta.closingTime}
          slotMinutes={clubMeta.defaultSlotMinutes}
          readOnly
        />
      )}
      <ClubAdminCourtForm
        open={formOpen}
        court={court}
        onClose={() => setFormOpen(false)}
        onSubmit={async (body) => {
          if (!courtId) return;
          await clubAdminApi.patchCourt(courtId, body);
          const courts = await clubAdminApi.listCourts(clubId!);
          setCourt(courts.find((c) => c.id === courtId) ?? null);
        }}
      />
    </ClubAdminLayout>
  );
}
