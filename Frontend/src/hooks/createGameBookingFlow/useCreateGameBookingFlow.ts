import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import type { TFunction } from 'i18next';
import toast from 'react-hot-toast';
import type { Club, Court, EntityType } from '@/types';
import type { LocationTimeMode } from '@/components/gameLocationTime/LocationTimeMode';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import type { BookingSnapshotInput } from '@shared/gameBooking/contracts';
import type { BooktimeIntegrationConfig } from '@/components/booktime/ConnectClubSheet';
import type { SummaryChipItem } from '@/components/createGame/summaryHeader/CreateGameSummaryBar';
import { useGameLocationTimeState } from '@/components/gameLocationTime/useGameLocationTimeState';
import { useBooktimeTimeOptions } from '@/hooks/useBooktimeTimeOptions';
import { useBooktimeClubAuth } from '@/hooks/useBooktimeClubAuth';
import { useBooktimeLiveApiEnabled } from '@/hooks/useBooktimeLiveApiEnabled';
import { useBooktimeSnapshotRefresh } from '@/hooks/useBooktimeSnapshotRefresh';
import { useBooktimeCompanyMeta } from '@/hooks/useBooktimeCompanyMeta';
import { supportsClubBookingFlow } from '@shared/gameBooking/supportsClubBookingFlow';
import { clubHasBookingIntegration, parseBooktimeIntegrationConfig } from '@shared/clubIntegration';
import { checkBookingOverlap, fetchBookedCourtsForDay } from '@/utils/bookedCourts/overlapCheck';
import { courtHasActiveBookingIntegration } from '@/utils/clubBookingIntegration';
import { assembleCreateGameBookingFields } from './assembleCreateGameBookingFields';
import { resolveCreateButtonLabel } from './resolveCreateButtonLabel';
import { resolveCreateGameBookingAction } from './resolveCreateGameBookingAction';
import { shouldPromptMarkCourtAfterCreate } from './shouldPromptMarkCourtAfterCreate';
import type {
  CreateGameAttemptResult,
  CreateGameBookingFields,
  CreateGameBookingOverrides,
  OverlapGateResult,
} from './types';

type TimeOptionHelpers = {
  generateTimeOptions: () => string[];
  generateTimeOptionsForDate: (date: Date) => string[];
  canAccommodateDuration: (time: string, duration: number) => boolean;
  getAdjustedStartTime: (clickedTime: string, duration: number) => string | null;
  getTimeSlotsForDuration: (startTime: string, duration: number) => string[];
  isSlotHighlighted: (time: string) => boolean;
};

export type UseCreateGameBookingFlowArgs = {
  entityType: EntityType;
  selectedClub: string;
  selectedClubData: Club | undefined;
  selectedCourt: string;
  selectedCourtIds: string[];
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  selectedTime: string;
  setSelectedTime: (time: string) => void;
  duration: number;
  courts: Court[];
  clubs: Club[];
  multiCourtMode: boolean;
  maxParticipants: number;
  playersPerMatch: number;
  liveApiEnabledFromPanel?: boolean;
  initialHasBookedCourt?: boolean;
  initialLocationTimeMode?: LocationTimeMode;
  initialBookingIds?: string[];
  storedInitialDate: Date;
  hasInitialStartTime?: boolean;
  createDateFromSelection: () => { startTime: string; endTime: string };
  baseTimeOptions: TimeOptionHelpers;
  handleCourtSelect: (id: string) => void;
  onNavigateAfterCreate: (gameStartTime: string) => void;
  t: TFunction;
};

export function useCreateGameBookingFlow({
  entityType,
  selectedClub,
  selectedClubData,
  selectedCourt,
  selectedCourtIds,
  selectedDate,
  setSelectedDate,
  selectedTime,
  setSelectedTime,
  duration,
  courts,
  clubs,
  multiCourtMode,
  maxParticipants,
  playersPerMatch,
  initialHasBookedCourt = false,
  initialLocationTimeMode,
  initialBookingIds = [],
  storedInitialDate,
  hasInitialStartTime = false,
  createDateFromSelection,
  baseTimeOptions,
  handleCourtSelect,
  onNavigateAfterCreate,
  t,
}: UseCreateGameBookingFlowArgs) {
  const preselectedBookings = initialBookingIds.length > 0;
  const [hasBookedCourt, setHasBookedCourt] = useState(initialHasBookedCourt);
  const [selectedBookingRecords, setSelectedBookingRecords] = useState<BooktimeBookingRecord[]>([]);
  const [derivedBookingSummary, setDerivedBookingSummary] = useState<{
    startTime: string | null;
    endTime: string | null;
    count: number;
  }>({ startTime: null, endTime: null, count: 0 });
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [softOverlapOpen, setSoftOverlapOpen] = useState(false);
  const [markCourtOpen, setMarkCourtOpen] = useState(false);
  const [pendingGameId, setPendingGameId] = useState<string | null>(null);
  const [pendingGameStartTime, setPendingGameStartTime] = useState<string | null>(null);

  const clubBookingFlowActive =
    clubHasBookingIntegration(selectedClubData) &&
    supportsClubBookingFlow(entityType, 'create') &&
    Boolean(selectedClub);
  const { apiEnabled: liveApiEnabled } = useBooktimeLiveApiEnabled(
    selectedClub || undefined,
    clubBookingFlowActive,
  );

  const locationTimeState = useGameLocationTimeState({
    entityType,
    panelMode: 'create',
    club: selectedClubData,
    courts,
    liveApiEnabled,
    maxParticipants,
    playersPerMatch,
    selectedCourtIds,
    selectedDate,
    selectedTime,
    duration,
    hasBookedCourt,
    initialLocationTimeMode: initialLocationTimeMode ?? (preselectedBookings ? 'bookings' : undefined),
    initialSelectedBookingIds: initialBookingIds,
    createDateFromSelection,
  });

  const {
    locationTimeMode,
    setLocationTimeMode,
    showSegmentedSwitch,
    willBookOnCreate,
    skipRealCourtBooking,
    setSkipRealCourtBooking,
    selectedBookingIds,
    setSelectedBookingIds,
    timeOverride,
    setTimeOverride,
    overrideStartTime,
    overrideEndTime,
    setOverrideTimes,
    bookingSelectionLimits,
    integratedCourtIds,
    buildCreatePayload,
    dirtyFlags,
  } = locationTimeState;

  const { status: booktimeAuth, refresh: refreshBooktimeAuth } = useBooktimeClubAuth(
    selectedClub || undefined,
    clubBookingFlowActive,
  );
  const needsBooktimeAuth = Boolean(
    willBookOnCreate && clubBookingFlowActive && !booktimeAuth?.connected,
  );
  const booktimeCompanyMeta = useBooktimeCompanyMeta(
    selectedClubData,
    (willBookOnCreate || locationTimeMode === 'bookings') && clubBookingFlowActive && !needsBooktimeAuth,
  );
  const snapshotRefreshEnabled =
    (willBookOnCreate || locationTimeMode === 'bookings') && clubBookingFlowActive && !needsBooktimeAuth;
  const {
    refreshSnapshot,
    snapshotBanner: createGameSnapshotBanner,
    lastFetchedAt: snapshotLastFetchedAt,
    isRefreshingSnapshot,
  } = useBooktimeSnapshotRefresh(selectedClubData, selectedDate, snapshotRefreshEnabled);

  const booktimeTimeOptions = useBooktimeTimeOptions({
    club: selectedClubData,
    courts,
    selectedDate,
    durationHours: duration,
    selectedCourtId: selectedCourt === 'notBooked' ? null : selectedCourt,
    enabled:
      entityType !== 'BAR' &&
      clubHasBookingIntegration(selectedClubData) &&
      !needsBooktimeAuth &&
      (locationTimeMode !== 'timeSlots' || !willBookOnCreate || Boolean(booktimeAuth?.connected)),
  });

  const resolvedGenerateTimeOptions = booktimeTimeOptions.active
    ? booktimeTimeOptions.generateTimeOptions
    : baseTimeOptions.generateTimeOptions;
  const resolvedGenerateTimeOptionsForDate = booktimeTimeOptions.active
    ? booktimeTimeOptions.generateTimeOptionsForDate
    : baseTimeOptions.generateTimeOptionsForDate;
  const resolvedCanAccommodateDuration = booktimeTimeOptions.active
    ? booktimeTimeOptions.canAccommodateDuration
    : baseTimeOptions.canAccommodateDuration;
  const resolvedGetAdjustedStartTime = booktimeTimeOptions.active
    ? booktimeTimeOptions.getAdjustedStartTime
    : baseTimeOptions.getAdjustedStartTime;
  const resolvedGetTimeSlotsForDuration = booktimeTimeOptions.active
    ? booktimeTimeOptions.getTimeSlotsForDuration
    : baseTimeOptions.getTimeSlotsForDuration;
  const resolvedIsSlotHighlighted = booktimeTimeOptions.active
    ? (time: string) => booktimeTimeOptions.isSlotHighlighted(time, selectedTime, duration)
    : baseTimeOptions.isSlotHighlighted;

  const { clampDate: clampBooktimeDate, fixedDates: booktimeFixedDates } = booktimeCompanyMeta;

  const booktimeIntegrationConfig = useMemo((): BooktimeIntegrationConfig | null => {
    if (!selectedClubData || !clubHasBookingIntegration(selectedClubData)) return null;
    return parseBooktimeIntegrationConfig(selectedClubData.integrationConfig);
  }, [selectedClubData]);

  const snapshotBlocked =
    createGameSnapshotBanner === 'noSyncToday' ||
    (createGameSnapshotBanner === 'scoutPoolEmpty' && !snapshotLastFetchedAt);

  const derivedBookingWindowLabel = useMemo(() => {
    if (!derivedBookingSummary.startTime || !derivedBookingSummary.endTime) return null;
    const start = new Date(derivedBookingSummary.startTime);
    const end = new Date(derivedBookingSummary.endTime);
    return `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }, [derivedBookingSummary.startTime, derivedBookingSummary.endTime]);

  const createButtonLabel = resolveCreateButtonLabel({
    t,
    entityType,
    needsBooktimeAuth,
    willBookOnCreate,
    integratedCourtCount: integratedCourtIds.length,
  });

  const resetOnClubChange = useCallback(() => {
    setSelectedBookingIds([]);
    setSelectedBookingRecords([]);
  }, [setSelectedBookingIds]);

  useEffect(() => {
    if (selectedCourt === 'notBooked' && selectedCourtIds.length === 0) {
      setHasBookedCourt(false);
      return;
    }
    if (willBookOnCreate || locationTimeMode === 'bookings') {
      setHasBookedCourt(false);
    }
  }, [selectedCourt, selectedCourtIds.length, willBookOnCreate, locationTimeMode]);

  const prevLiveApiEnabledRef = useRef(liveApiEnabled);
  useEffect(() => {
    if (prevLiveApiEnabledRef.current && !liveApiEnabled && willBookOnCreate) {
      toast(t('createGame.booktime.liveApiUnavailable'));
    }
    prevLiveApiEnabledRef.current = liveApiEnabled;
  }, [liveApiEnabled, willBookOnCreate, t]);

  useEffect(() => {
    if (!willBookOnCreate || !booktimeFixedDates?.length) return;
    const clamped = clampBooktimeDate(selectedDate);
    if (format(clamped, 'yyyy-MM-dd') !== format(selectedDate, 'yyyy-MM-dd')) {
      setSelectedDate(clamped);
      setSelectedTime('');
    }
  }, [willBookOnCreate, booktimeFixedDates, clampBooktimeDate, selectedDate, setSelectedDate, setSelectedTime]);

  const confirmFormSnapshotRef = useRef<string | null>(null);
  useEffect(() => {
    if (!confirmModalOpen) {
      confirmFormSnapshotRef.current = null;
      return;
    }
    const snapshot = `${selectedClub}|${selectedCourt}|${selectedTime}|${duration}|${format(selectedDate, 'yyyy-MM-dd')}`;
    if (confirmFormSnapshotRef.current === null) {
      confirmFormSnapshotRef.current = snapshot;
      return;
    }
    if (confirmFormSnapshotRef.current !== snapshot) {
      setConfirmModalOpen(false);
      confirmFormSnapshotRef.current = null;
    }
  }, [confirmModalOpen, selectedClub, selectedCourt, selectedTime, duration, selectedDate]);

  const generateTimeOptionsForDateRef = useRef(resolvedGenerateTimeOptionsForDate);
  generateTimeOptionsForDateRef.current = resolvedGenerateTimeOptionsForDate;
  const initialDateSetForClubRef = useRef<string | null>(null);
  useEffect(() => {
    if (hasInitialStartTime) return;
    if (!selectedClub || courts.length === 0) return;
    if (booktimeTimeOptions.active && booktimeTimeOptions.loading) return;
    if (initialDateSetForClubRef.current === selectedClub) return;
    initialDateSetForClubRef.current = selectedClub;

    const pickInitialDate = generateTimeOptionsForDateRef.current;
    const initialDateTimeSlots = pickInitialDate(storedInitialDate);
    if (initialDateTimeSlots.length > 0) {
      setSelectedDate(storedInitialDate);
      return;
    }
    const tomorrow = new Date(storedInitialDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowTimeSlots = pickInitialDate(tomorrow);
    setSelectedDate(tomorrowTimeSlots.length > 0 ? tomorrow : storedInitialDate);
  }, [
    selectedClub,
    courts.length,
    booktimeTimeOptions.active,
    booktimeTimeOptions.loading,
    storedInitialDate,
    setSelectedDate,
    hasInitialStartTime,
  ]);

  useEffect(() => {
    initialDateSetForClubRef.current = null;
  }, [selectedClub]);

  const runBookingOverlapGate = useCallback(async (): Promise<OverlapGateResult> => {
    if (willBookOnCreate || locationTimeMode === 'bookings') return 'skip';
    if (entityType === 'BAR' || !selectedClub || !selectedTime || !duration) return 'skip';
    const club = clubs.find((c) => c.id === selectedClub);
    try {
      const bookings = await fetchBookedCourtsForDay({
        clubId: selectedClub,
        selectedDate,
        courtId: selectedCourt !== 'notBooked' ? selectedCourt : undefined,
        club,
      });
      const overlap = checkBookingOverlap(bookings, selectedTime, duration, club);
      if (overlap.hasHardOverlap) {
        toast.error(t('createGame.overlapHardSave'));
        return 'hard';
      }
      if (overlap.hasSoftOverlap) return 'soft';
    } catch {
      return 'ok';
    }
    return 'ok';
  }, [
    willBookOnCreate,
    locationTimeMode,
    entityType,
    selectedClub,
    selectedTime,
    duration,
    clubs,
    selectedDate,
    selectedCourt,
    t,
  ]);

  const resolveCreateAttempt = useCallback(async (): Promise<CreateGameAttemptResult> => {
    const overlapGate = await runBookingOverlapGate();
    return resolveCreateGameBookingAction({
      needsBooktimeAuth,
      locationTimeMode,
      selectedBookingCount: selectedBookingIds.length,
      bookingSelectionMin: bookingSelectionLimits.min,
      willBookOnCreate,
      integratedCourtCount: integratedCourtIds.length,
      selectedCourt,
      selectedCourtCount: selectedCourtIds.length,
      overlapGate,
    });
  }, [
    runBookingOverlapGate,
    needsBooktimeAuth,
    locationTimeMode,
    selectedBookingIds.length,
    bookingSelectionLimits.min,
    willBookOnCreate,
    integratedCourtIds.length,
    selectedCourt,
    selectedCourtIds.length,
  ]);

  const handleCreateAttempt = useCallback(
    async (
      onProceed: (overrides?: CreateGameBookingOverrides) => Promise<void>,
      onAbort?: () => void,
    ) => {
      const result = await resolveCreateAttempt();
      if (result.status === 'abort') {
        onAbort?.();
        return;
      }
      if (result.status === 'softOverlap') {
        setSoftOverlapOpen(true);
        return;
      }
      if (result.status === 'confirm') {
        setConfirmModalOpen(true);
        return;
      }
      await onProceed(result.overrides);
    },
    [resolveCreateAttempt],
  );

  const prepareBookingFields = useCallback(
    async (overrides?: CreateGameBookingOverrides): Promise<CreateGameBookingFields> => {
      if (snapshotRefreshEnabled) {
        await refreshSnapshot({ force: true });
      }
      return assembleCreateGameBookingFields({
        locationTimeMode,
        selectedBookingRecords,
        buildCreatePayload,
        createDateFromSelection,
        multiCourtMode,
        selectedCourt,
        selectedCourtIds,
        hasBookedCourt,
        overrides,
      });
    },
    [
      snapshotRefreshEnabled,
      refreshSnapshot,
      locationTimeMode,
      selectedBookingRecords,
      buildCreatePayload,
      createDateFromSelection,
      multiCourtMode,
      selectedCourt,
      selectedCourtIds,
      hasBookedCourt,
    ],
  );

  const evaluatePostCreate = useCallback(
    (
      created: { id?: string; startTime: string },
      overrides?: CreateGameBookingOverrides,
    ): 'markCourtPrompt' | 'navigate' => {
      const createClub = clubs.find((c) => c.id === selectedClub);
      const createCourt =
        selectedCourt !== 'notBooked' ? courts.find((c) => c.id === selectedCourt) : undefined;
      if (
        shouldPromptMarkCourtAfterCreate({
          entityType,
          selectedCourt,
          hasBookedCourt,
          willBookOnCreate,
          locationTimeMode,
          clubHasActiveIntegration: courtHasActiveBookingIntegration(createClub, createCourt),
          overrides,
          createdGameId: created.id,
        })
      ) {
        setPendingGameId(created.id ?? null);
        setPendingGameStartTime(created.startTime);
        setMarkCourtOpen(true);
        return 'markCourtPrompt';
      }
      return 'navigate';
    },
    [
      clubs,
      selectedClub,
      courts,
      selectedCourt,
      hasBookedCourt,
      willBookOnCreate,
      locationTimeMode,
      entityType,
    ],
  );

  const finishPendingNavigate = useCallback(() => {
    const start = pendingGameStartTime;
    setMarkCourtOpen(false);
    setPendingGameId(null);
    setPendingGameStartTime(null);
    if (start) onNavigateAfterCreate(start);
  }, [pendingGameStartTime, onNavigateAfterCreate]);

  const handleMarkCourtBooked = useCallback(
    async (updateGame: (gameId: string) => Promise<void>) => {
      if (pendingGameId) {
        try {
          await updateGame(pendingGameId);
        } catch (e) {
          console.error('Failed to mark court booked:', e);
        }
      }
      finishPendingNavigate();
    },
    [pendingGameId, finishPendingNavigate],
  );

  const handleSlotTaken = useCallback(() => {
    setSelectedTime('');
    booktimeTimeOptions.reload();
  }, [setSelectedTime, booktimeTimeOptions]);

  const getConfirmModalProps = useCallback(
    (args: {
      summaryChips: SummaryChipItem[];
      onExecuteCreateGame: (overrides: {
        externalBookingIds: string[];
        bookingSnapshots: BookingSnapshotInput[];
        hasBookedCourt: true;
        rollbackBooktimeBooking: true;
      }) => Promise<void>;
      onSuccess: () => void;
    }) => {
      if (!selectedClubData || !booktimeIntegrationConfig || !confirmModalOpen) return null;
      return {
        open: confirmModalOpen,
        onOpenChange: setConfirmModalOpen,
        club: selectedClubData,
        companyId: booktimeIntegrationConfig.companyId,
        bookings: integratedCourtIds
          .map((id) => courts.find((c) => c.id === id))
          .filter((court): court is Court => court != null)
          .map((court) => ({
            court,
            date: selectedDate,
            startTime: selectedTime,
            durationMinutes: Math.round(duration * 60),
          })),
        phoneNumber: booktimeAuth?.phoneNumber ?? null,
        firstName: booktimeAuth?.firstName ?? null,
        lastName: booktimeAuth?.lastName ?? null,
        allowedHoursToCancel: booktimeCompanyMeta.allowedHoursToCancel,
        currency: booktimeCompanyMeta.currency,
        summaryChips: args.summaryChips,
        bookFlowContext: {
          refreshSnapshot,
          lastFetchedAt: snapshotLastFetchedAt,
        },
        snapshotBlocked,
        onExecuteCreateGame: args.onExecuteCreateGame,
        onSlotTaken: handleSlotTaken,
        onSuccess: () => {
          setConfirmModalOpen(false);
          args.onSuccess();
        },
      };
    },
    [
      selectedClubData,
      booktimeIntegrationConfig,
      confirmModalOpen,
      integratedCourtIds,
      courts,
      selectedDate,
      selectedTime,
      duration,
      booktimeAuth?.phoneNumber,
      booktimeAuth?.firstName,
      booktimeAuth?.lastName,
      booktimeCompanyMeta.allowedHoursToCancel,
      booktimeCompanyMeta.currency,
      refreshSnapshot,
      snapshotLastFetchedAt,
      snapshotBlocked,
      handleSlotTaken,
    ],
  );

  return {
    clubBookingFlowActive,
    hasBookedCourt,
    setHasBookedCourt,
    locationTimeMode,
    setLocationTimeMode,
    showSegmentedSwitch,
    willBookOnCreate,
    skipRealCourtBooking,
    setSkipRealCourtBooking,
    selectedBookingIds,
    setSelectedBookingIds,
    selectedBookingRecords,
    setSelectedBookingRecords,
    timeOverride,
    setTimeOverride,
    overrideStartTime,
    overrideEndTime,
    setOverrideTimes,
    bookingSelectionLimits,
    dirtyFlags,
    derivedBookingSummary,
    setDerivedBookingSummary,
    derivedBookingWindowLabel,
    needsBooktimeAuth,
    booktimeAuth,
    refreshBooktimeAuth,
    booktimeIntegrationConfig,
    booktimeCompanyMeta,
    booktimeFixedDates,
    clampBooktimeDate,
    createGameSnapshotBanner,
    isRefreshingSnapshot,
    snapshotRefreshEnabled,
    booktimeTimeOptions,
    resolvedGenerateTimeOptions,
    resolvedGenerateTimeOptionsForDate,
    resolvedCanAccommodateDuration,
    resolvedGetAdjustedStartTime,
    resolvedGetTimeSlotsForDuration,
    resolvedIsSlotHighlighted,
    createButtonLabel,
    createDisabledByAuth: needsBooktimeAuth,
    preselectedBookings,
    resetOnClubChange,
    handleCreateAttempt,
    prepareBookingFields,
    evaluatePostCreate,
    softOverlapOpen,
    setSoftOverlapOpen,
    markCourtOpen,
    handleMarkCourtBooked,
    handleSkipMarkCourt: finishPendingNavigate,
    getConfirmModalProps,
    handleCourtSelectForAuthSkip: () => {
      handleCourtSelect('notBooked');
      setLocationTimeMode('timeSlots');
    },
    handleAuthConnected: () => {
      void refreshBooktimeAuth();
      if (booktimeFixedDates?.length) {
        const clamped = clampBooktimeDate(selectedDate);
        if (format(clamped, 'yyyy-MM-dd') !== format(selectedDate, 'yyyy-MM-dd')) {
          setSelectedDate(clamped);
          setSelectedTime('');
        }
      }
    },
    onSelectedBookingIdsChange: (ids: string[], records: BooktimeBookingRecord[] = []) => {
      setSelectedBookingIds(ids);
      setSelectedBookingRecords(records);
      setDerivedBookingSummary((prev) => ({ ...prev, count: ids.length }));
    },
    onDerivedTimeChange: (start: string | null, end: string | null) => {
      setDerivedBookingSummary({
        startTime: start,
        endTime: end,
        count: selectedBookingIds.length,
      });
    },
  };
}

export type CreateGameBookingFlow = ReturnType<typeof useCreateGameBookingFlow>;
