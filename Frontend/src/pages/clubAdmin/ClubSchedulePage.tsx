import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { RefreshCw } from 'lucide-react';
import { clubAdminApi, CourtSlotHold, ScheduleSlot } from '@/api/clubAdmin';
import { chatApi } from '@/api/chat';
import { useClubAdminScrollContainer } from '@/components/clubAdmin/ClubAdminScrollContext';
import { CourtScheduleGrid } from '@/components/clubAdmin/CourtScheduleGrid';
import { SlotDetailSheet } from '@/components/clubAdmin/SlotDetailSheet';
import { BlockSlotSheet } from '@/components/clubAdmin/BlockSlotSheet';
import { EditHoldSheet } from '@/components/clubAdmin/EditHoldSheet';
import { CancelGameSheet, CancelPreviewParams } from '@/components/clubAdmin/CancelGameSheet';
import { ClubAdminCoachMark } from '@/components/clubAdmin/ClubAdminCoachMark';
import { ScheduleDatePicker } from '@/components/clubAdmin/ScheduleDatePicker';
import { ScheduleLegend } from '@/components/clubAdmin/ScheduleLegend';
import { BooktimeScheduleStatus } from '@/components/clubAdmin/BooktimeScheduleStatus';
import { RefreshIndicator } from '@/components/RefreshIndicator';
import { useClubAdminSchedule } from '@/hooks/useClubAdminSchedule';
import { useClubAdminForbidden } from '@/hooks/useClubAdminForbidden';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { UNASSIGNED_COURT_ID } from '@/utils/clubAdmin/constants';
import { formatSlotDateTime } from '@/utils/clubAdmin/cancelMessage';
import { Court } from '@/types';
import {
  markClubAdminCoachStep,
  readClubAdminCoachMarks,
} from '@/utils/clubAdminCoachMarksStorage';
import { useClubAdminScreen } from '@/clubAdmin/useClubAdminShell';

export function ClubSchedulePage() {
  const { clubId } = useParams<{ clubId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const handleForbidden = useClubAdminForbidden();
  const date = searchParams.get('date') || format(new Date(), 'yyyy-MM-dd');
  const [club, setClub] = useState<{
    name: string;
    city?: { timezone?: string };
    openingTime?: string | null;
    closingTime?: string | null;
    defaultSlotMinutes?: number | null;
    integrationType?: string | null;
    courts: Court[];
  } | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<ScheduleSlot | null>(null);
  const [freeSlot, setFreeSlot] = useState<{ courtId: string; time: string } | null>(null);
  const [slotPast, setSlotPast] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [editHoldOpen, setEditHoldOpen] = useState(false);
  const [editHold, setEditHold] = useState<CourtSlotHold | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelMode, setCancelMode] = useState<'cancel' | 'clear'>('cancel');
  const [coachMarks, setCoachMarks] = useState(readClubAdminCoachMarks);

  useClubAdminScreen({
    title: club?.name ?? t('clubAdmin.schedule'),
    backTo: `/my-clubs/${clubId}`,
  });

  const { data, loading, error, refetch } = useClubAdminSchedule(clubId!, date);

  const handleRefresh = useCallback(async () => {
    await refetch();
    if (clubId) {
      const c = await clubAdminApi.getClub(clubId);
      setClub({
        name: c.name,
        city: c.city,
        openingTime: c.openingTime,
        closingTime: c.closingTime,
        defaultSlotMinutes: (c as { defaultSlotMinutes?: number | null }).defaultSlotMinutes,
        integrationType: c.integrationType ?? null,
        courts: c.courts || [],
      });
    }
  }, [clubId, refetch]);

  const scrollContainerRef = useClubAdminScrollContainer();

  const { isRefreshing, pullDistance, pullProgress } = usePullToRefresh({
    onRefresh: handleRefresh,
    disabled: loading,
    scrollContainerRef: scrollContainerRef ?? undefined,
  });

  useEffect(() => {
    if (!clubId) return;
    clubAdminApi
      .getClub(clubId)
      .then((c) =>
        setClub({
          name: c.name,
          city: c.city,
          openingTime: c.openingTime,
          closingTime: c.closingTime,
          defaultSlotMinutes: (c as { defaultSlotMinutes?: number | null }).defaultSlotMinutes,
          integrationType: c.integrationType ?? null,
          courts: c.courts || [],
        })
      )
      .catch((e) => {
        if (!handleForbidden(e)) navigate(`/my-clubs/${clubId}`);
      });
  }, [clubId, handleForbidden, navigate]);

  const courts = club?.courts ?? [];
  const slots = data?.slots ?? [];

  const cancelPreview: CancelPreviewParams | null = useMemo(() => {
    if (!selectedSlot || (selectedSlot.type !== 'game' && selectedSlot.type !== 'game_court')) return null;
    const { date: d, time } = formatSlotDateTime(selectedSlot.startTime);
    return {
      mode: cancelMode,
      hostFirstName: selectedSlot.host.firstName,
      clubName: club?.name ?? 'the club',
      date: d,
      time,
    };
  }, [selectedSlot, cancelMode, club?.name]);

  const handleSlotClick = (courtId: string, time: string, slot?: ScheduleSlot, isPast?: boolean) => {
    if (!slot && courtId === UNASSIGNED_COURT_ID) return;
    setSelectedSlot(slot ?? null);
    setFreeSlot(slot ? null : { courtId, time });
    setSlotPast(!!isPast);
    setSheetOpen(true);
  };

  const openCancel = (mode: 'cancel' | 'clear') => {
    setCancelMode(mode);
    setSheetOpen(false);
    setCancelOpen(true);
  };

  const handleMessageHost = async () => {
    if (!selectedSlot || (selectedSlot.type !== 'game' && selectedSlot.type !== 'game_court')) return;
    setSheetOpen(false);
    try {
      const res = await chatApi.getOrCreateChatWithUser(selectedSlot.host.id);
      const chat = res?.data;
      if (chat?.id) navigate(`/user-chat/${chat.id}`);
    } catch {
      /* ignore */
    }
  };

  if (!clubId) return null;

  return (
    <>
      <RefreshIndicator isRefreshing={isRefreshing} pullDistance={pullDistance} pullProgress={pullProgress} />
      <div className="mb-3 flex gap-2">
        <ScheduleDatePicker date={date} onDateChange={(d) => setSearchParams({ date: d })} />
        <button
          type="button"
          className="rounded-lg border border-border px-3 py-2 hover:bg-muted"
          onClick={() => void handleRefresh()}
          disabled={isRefreshing || loading}
          aria-label={t('clubAdmin.refresh')}
        >
          <RefreshCw className={`h-5 w-5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {error && (
        <p className="mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {t('clubAdmin.scheduleLoadFailed')}
        </p>
      )}
      {club?.integrationType === 'BOOKTIME' ? (
        <BooktimeScheduleStatus
          clubId={clubId}
          isLoadingExternalSlots={!!data?.isLoadingExternalSlots}
          externalSlotsFailed={data?.externalSlotsFailed}
          snapshotFetchedAt={data?.snapshotFetchedAt}
          hasSnapshotForDate={data?.hasSnapshotForDate}
          unmappedExternalCourtCount={data?.unmappedExternalCourtCount}
        />
      ) : (
        <>
          {data?.externalSlotsFailed && (
            <p className="mb-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              {t('clubAdmin.integrationDown')}
            </p>
          )}
          {data?.isLoadingExternalSlots && (
            <p className="mb-2 text-xs text-muted-foreground">{t('clubAdmin.updatingAvailability')}</p>
          )}
        </>
      )}
      {data?.conflicts && data.conflicts.length > 0 && (
        <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">{t('clubAdmin.conflicts', { count: data.conflicts.length })}</p>
      )}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {loading ? (
            <p className="text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
          ) : (
            <ClubAdminCoachMark
              show={coachMarks.schedule && !coachMarks.tapSlot}
              stepLabel={t('clubAdmin.coachStep', { current: 2, total: 3 })}
              message={t('clubAdmin.coachTapSlot')}
              onDismiss={() => {
                markClubAdminCoachStep('tapSlot');
                setCoachMarks(readClubAdminCoachMarks());
              }}
            >
              <CourtScheduleGrid
                courts={courts}
                slots={slots}
                scheduleDate={date}
                club={club}
                openingTime={club?.openingTime}
                closingTime={club?.closingTime}
                slotMinutes={club?.defaultSlotMinutes}
                onSlotClick={handleSlotClick}
              />
            </ClubAdminCoachMark>
          )}
          {!loading && <ScheduleLegend className="mt-3" />}
        </div>
        <SlotDetailSheet
          layout="rail"
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          slot={selectedSlot}
          freeSlot={freeSlot}
          readOnly={slotPast}
          onBlock={
            freeSlot && freeSlot.courtId !== UNASSIGNED_COURT_ID && !slotPast
              ? () => {
                  setSheetOpen(false);
                  setBlockOpen(true);
                }
              : undefined
          }
          onCancel={!slotPast ? () => openCancel('cancel') : undefined}
          onClearCourt={!slotPast ? () => openCancel('clear') : undefined}
          onMessageHost={!slotPast ? () => void handleMessageHost() : undefined}
          onEditHold={
            selectedSlot?.type === 'hold' && !slotPast
              ? () => {
                  const h = selectedSlot;
                  setEditHold({
                    id: h.holdId,
                    clubId: clubId!,
                    courtId: h.courtId,
                    startTime: h.startTime,
                    endTime: h.endTime,
                    label: h.label,
                    note: h.note,
                  });
                  setSheetOpen(false);
                  setEditHoldOpen(true);
                }
              : undefined
          }
          onReleaseHold={
            selectedSlot?.type === 'hold' && !slotPast
              ? async () => {
                  try {
                    await clubAdminApi.deleteHold(selectedSlot.holdId);
                    refetch();
                    setSheetOpen(false);
                  } catch (e) {
                    handleForbidden(e);
                  }
                }
              : undefined
          }
        />
      </div>
      <SlotDetailSheet
        layout="sheet"
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        slot={selectedSlot}
        freeSlot={freeSlot}
        readOnly={slotPast}
        onBlock={
          freeSlot && freeSlot.courtId !== UNASSIGNED_COURT_ID && !slotPast
            ? () => {
                setSheetOpen(false);
                setBlockOpen(true);
              }
            : undefined
        }
        onCancel={!slotPast ? () => openCancel('cancel') : undefined}
        onClearCourt={!slotPast ? () => openCancel('clear') : undefined}
        onMessageHost={!slotPast ? () => void handleMessageHost() : undefined}
        onEditHold={
          selectedSlot?.type === 'hold' && !slotPast
            ? () => {
                const h = selectedSlot;
                setEditHold({
                  id: h.holdId,
                  clubId: clubId!,
                  courtId: h.courtId,
                  startTime: h.startTime,
                  endTime: h.endTime,
                  label: h.label,
                  note: h.note,
                });
                setSheetOpen(false);
                setEditHoldOpen(true);
              }
            : undefined
        }
        onReleaseHold={
          selectedSlot?.type === 'hold' && !slotPast
            ? async () => {
                await clubAdminApi.deleteHold(selectedSlot.holdId);
                refetch();
                setSheetOpen(false);
              }
            : undefined
        }
      />
      {freeSlot && freeSlot.courtId !== UNASSIGNED_COURT_ID && (
        <BlockSlotSheet
          open={blockOpen}
          onClose={() => setBlockOpen(false)}
          courtId={freeSlot.courtId}
          date={date}
          startTime={freeSlot.time}
          club={club}
          onSubmit={async (body) => {
            try {
              await clubAdminApi.createHold(clubId, body);
              refetch();
            } catch (e) {
              handleForbidden(e);
            }
          }}
        />
      )}
      <EditHoldSheet
        open={editHoldOpen}
        hold={editHold}
        onClose={() => setEditHoldOpen(false)}
        onSubmit={async (holdId, body) => {
          try {
            await clubAdminApi.patchHold(holdId, body);
            refetch();
          } catch (e) {
            handleForbidden(e);
          }
        }}
      />
      {selectedSlot && (selectedSlot.type === 'game' || selectedSlot.type === 'game_court') && (
        <CancelGameSheet
          open={cancelOpen}
          onClose={() => setCancelOpen(false)}
          mode={cancelMode}
          previewParams={cancelPreview}
          onSubmit={async (body) => {
            try {
              if (cancelMode === 'cancel') {
                await clubAdminApi.cancelGame(clubId, selectedSlot.gameId, body);
              } else {
                await clubAdminApi.clearCourt(clubId, selectedSlot.gameId, body);
              }
              refetch();
            } catch (e) {
              handleForbidden(e);
            }
          }}
        />
      )}
    </>
  );
}
