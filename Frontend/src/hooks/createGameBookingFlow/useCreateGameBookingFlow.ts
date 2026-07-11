import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import type { TFunction } from 'i18next';
import toast from 'react-hot-toast';
import type { Club, Court, EntityType } from '@/types';
import type { Sport } from '@shared/sport';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import type { BookingSnapshotInput } from '@shared/gameBooking/contracts';
import type { BooktimeIntegrationConfig } from '@/components/booktime/ConnectClubSheet';
import type { SummaryChipItem } from '@/components/createGame/summaryHeader/CreateGameSummaryBar';
import { useGameLocationTimeState } from '@/components/gameLocationTime/useGameLocationTimeState';
import { useClubDateReservations } from '@/components/gameLocationTime/useClubDateReservations';
import { syncFormScheduleFromBookings } from '@/components/gameLocationTime/syncFormScheduleFromBookings';
import {
  areBookingRecordsEqual,
  areStringArraysEqual,
} from '@/components/gameLocationTime/locationTimeDraft';
import { useBooktimeTimeOptions } from '@/hooks/useBooktimeTimeOptions';
import { useBooktimeClubAuth } from '@/hooks/useBooktimeClubAuth';
import { useBooktimeLiveApiEnabled } from '@/hooks/useBooktimeLiveApiEnabled';
import { useBooktimeSnapshotRefresh } from '@/hooks/useBooktimeSnapshotRefresh';
import { useBooktimeCompanyMeta } from '@/hooks/useBooktimeCompanyMeta';
import { supportsClubBookingFlow } from '@shared/gameBooking/supportsClubBookingFlow';
import {
  resolveCreateReservationCtaKey,
  resolveInitialReservationIntent,
  resolveReservationIntentOptions,
  resolveReservationValidationMessage,
  type ReservationIntent,
} from '@shared/gameBooking/reservationIntent';
import { mapCreateAbortReasonToValidationReason } from './resolveCreateGameBookingAction';
import { clubHasBookingIntegration, parseBooktimeIntegrationConfig } from '@shared/clubIntegration';
import { checkBookingOverlap, fetchBookedCourtsForDay } from '@/utils/bookedCourts/overlapCheck';
import { courtHasActiveBookingIntegration } from '@/utils/clubBookingIntegration';
import { usePreselectedBookingHydration } from './usePreselectedBookingHydration';
import { assembleCreateGameBookingFields } from './assembleCreateGameBookingFields';
import { resolveCreateButtonLabel } from './resolveCreateButtonLabel';
import { resolveCreateGameBookingAction } from './resolveCreateGameBookingAction';
import { shouldPromptMarkCourtAfterCreate } from './shouldPromptMarkCourtAfterCreate';
import { shouldUseBooktimeTimeOptions } from './shouldUseBooktimeTimeOptions';
import type {
  CreateGameAbortReason,
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
  sport?: Sport;
  selectedClub: string;
  selectedClubData: Club | undefined;
  selectedCourt: string;
  selectedCourtIds: string[];
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  selectedTime: string;
  setSelectedTime: (time: string) => void;
  duration: number;
  setDuration: (duration: number) => void;
  setSelectedCourtIds: (ids: string[] | ((prev: string[]) => string[])) => void;
  courts: Court[];
  bookingMatchCourts?: Court[];
  clubs: Club[];
  multiCourtMode: boolean;
  maxParticipants: number;
  playersPerMatch: number;
  liveApiEnabledFromPanel?: boolean;
  initialHasBookedCourt?: boolean;
  initialBookingIds?: string[];
  storedInitialDate: Date;
  hasInitialStartTime?: boolean;
  createDateFromSelection: () => { startTime: string; endTime: string };
  baseTimeOptions: TimeOptionHelpers;
  onNavigateAfterCreate: (gameStartTime: string) => void;
  t: TFunction;
};

export function useCreateGameBookingFlow({
  entityType,
  sport,
  selectedClub,
  selectedClubData,
  selectedCourt,
  selectedCourtIds,
  selectedDate,
  setSelectedDate,
  selectedTime,
  setSelectedTime,
  duration,
  setDuration,
  setSelectedCourtIds,
  courts,
  bookingMatchCourts,
  clubs,
  multiCourtMode,
  maxParticipants,
  playersPerMatch,
  initialHasBookedCourt = false,
  initialBookingIds = [],
  storedInitialDate,
  hasInitialStartTime = false,
  createDateFromSelection,
  baseTimeOptions,
  onNavigateAfterCreate,
  t,
}: UseCreateGameBookingFlowArgs) {
  const preselectedBookings = initialBookingIds.length > 0;
  const [reservationIntent, setReservationIntentState] = useState<ReservationIntent>(() =>
    resolveInitialReservationIntent({
      hasPreselectedBookings: preselectedBookings,
      clubBookingFlowActive: clubHasBookingIntegration(selectedClubData) && supportsClubBookingFlow(entityType, 'create'),
      initialHasBookedCourt,
    }),
  );
  const [reservationIntentTouched, setReservationIntentTouched] = useState(false);
  const setReservationIntent = useCallback((intent: ReservationIntent) => {
    setReservationIntentTouched(true);
    setReservationIntentState(intent);
  }, []);
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

  const { status: booktimeAuth, refresh: refreshBooktimeAuth } = useBooktimeClubAuth(
    selectedClub || undefined,
    clubBookingFlowActive,
  );
  const needsBooktimeAuthForIntent = Boolean(
    clubBookingFlowActive &&
      !booktimeAuth?.connected &&
      (reservationIntent === 'reserveNow' || reservationIntent === 'useExisting'),
  );

  const locationTimeState = useGameLocationTimeState({
    entityType,
    panelMode: 'create',
    club: selectedClubData,
    courts,
    bookingMatchCourts,
    liveApiEnabled,
    maxParticipants,
    playersPerMatch,
    selectedCourtIds,
    selectedDate,
    selectedTime,
    duration,
    hasBookedCourt,
    initialSelectedBookingIds: initialBookingIds,
    reservationIntent,
    needsBooktimeAuth: needsBooktimeAuthForIntent,
    createDateFromSelection,
  });

  const {
    locationTimeMode,
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

  const needsBooktimeAuth = Boolean(
    clubBookingFlowActive &&
      !booktimeAuth?.connected &&
      (reservationIntent === 'reserveNow' || reservationIntent === 'useExisting' || willBookOnCreate),
  );
  const wantsReserveNowAvailability = reservationIntent === 'reserveNow';
  const booktimeCompanyMeta = useBooktimeCompanyMeta(
    selectedClubData,
    (wantsReserveNowAvailability || willBookOnCreate || locationTimeMode === 'bookings') &&
      clubBookingFlowActive &&
      !needsBooktimeAuth,
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
    selectedCourtIds: reservationIntent === 'reserveNow' ? selectedCourtIds : undefined,
    enabled: shouldUseBooktimeTimeOptions({
      entityType,
      clubHasBookingIntegration: clubHasBookingIntegration(selectedClubData),
      needsBooktimeAuth,
      locationTimeMode,
      willBookOnCreate: willBookOnCreate || wantsReserveNowAvailability,
      booktimeConnected: Boolean(booktimeAuth?.connected),
    }),
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

  const clubDateReservationsEnabled =
    clubBookingFlowActive &&
    Boolean(booktimeAuth?.connected) &&
    Boolean(booktimeIntegrationConfig?.companyId);

  const clubDateReservations = useClubDateReservations({
    club: selectedClubData,
    companyId: booktimeIntegrationConfig?.companyId ?? '',
    selectedDate,
    enabled: clubDateReservationsEnabled,
    matchCourts: bookingMatchCourts ?? courts,
  });

  const hasReservationsForDate =
    preselectedBookings ||
    (clubDateReservations.bookingsLoaded && clubDateReservations.dateBookings.length > 0);

  const snapshotBlocked =
    createGameSnapshotBanner === 'noSyncToday' ||
    (createGameSnapshotBanner === 'scoutPoolEmpty' && !snapshotLastFetchedAt);

  const createButtonLabel = resolveCreateButtonLabel({
    t,
    entityType,
    needsBooktimeAuth,
    willBookOnCreate,
    integratedCourtCount: integratedCourtIds.length,
  });
  const reservationCta = resolveCreateReservationCtaKey({
    intent: reservationIntent,
    requiredReservationCount: bookingSelectionLimits.min,
  });
  const resolvedCreateButtonLabel =
    entityType === 'GAME' || entityType === 'TRAINING'
      ? t(reservationCta.key, reservationCta.values)
      : createButtonLabel;

  const reservationIntentOptions = useMemo(
    () =>
      resolveReservationIntentOptions({
        clubBookingFlowActive,
        hasBooktimeAuthPath: Boolean(booktimeIntegrationConfig),
        manualBookedAvailable: !clubBookingFlowActive,
        hasReservationsForDate,
      }),
    [clubBookingFlowActive, booktimeIntegrationConfig, hasReservationsForDate],
  );

  const resetOnClubChange = useCallback(() => {
    setSelectedBookingIds([]);
    setSelectedBookingRecords([]);
  }, [setSelectedBookingIds]);

  const prevSelectedClubRef = useRef(selectedClub);
  useEffect(() => {
    if (prevSelectedClubRef.current === selectedClub) return;
    prevSelectedClubRef.current = selectedClub;
    setReservationIntentTouched(false);
    setReservationIntentState(
      resolveInitialReservationIntent({
        hasPreselectedBookings: false,
        clubBookingFlowActive,
        initialHasBookedCourt: false,
      }),
    );
  }, [selectedClub, clubBookingFlowActive]);

  useEffect(() => {
    if (reservationIntentTouched || !selectedClub) return;
    setReservationIntentState(
      resolveInitialReservationIntent({
        hasPreselectedBookings: preselectedBookings,
        clubBookingFlowActive,
        initialHasBookedCourt,
      }),
    );
  }, [
    reservationIntentTouched,
    selectedClub,
    preselectedBookings,
    clubBookingFlowActive,
    initialHasBookedCourt,
  ]);

  useEffect(() => {
    const availableIds = new Set(reservationIntentOptions.map((option) => option.id));
    if (availableIds.has(reservationIntent)) return;
    setReservationIntentState(
      resolveInitialReservationIntent({
        hasPreselectedBookings: preselectedBookings,
        clubBookingFlowActive,
        initialHasBookedCourt,
      }),
    );
  }, [
    reservationIntent,
    reservationIntentOptions,
    preselectedBookings,
    clubBookingFlowActive,
    initialHasBookedCourt,
  ]);

  useEffect(() => {
    if (reservationIntent !== 'useExisting') return;
    if (hasReservationsForDate) return;
    if (!clubDateReservations.bookingsLoaded && !preselectedBookings) return;
    setReservationIntentState(
      resolveInitialReservationIntent({
        hasPreselectedBookings: false,
        clubBookingFlowActive,
        initialHasBookedCourt: false,
      }),
    );
  }, [
    reservationIntent,
    hasReservationsForDate,
    clubDateReservations.bookingsLoaded,
    preselectedBookings,
    clubBookingFlowActive,
  ]);

  useEffect(() => {
    if (reservationIntent === 'useExisting') return;
    if (selectedBookingIds.length > 0) {
      setSelectedBookingIds([]);
      setSelectedBookingRecords([]);
      setDerivedBookingSummary({ startTime: null, endTime: null, count: 0 });
    }
  }, [reservationIntent, selectedBookingIds.length, setSelectedBookingIds]);

  const prevReservationIntentRef = useRef(reservationIntent);
  useEffect(() => {
    const previousIntent = prevReservationIntentRef.current;
    prevReservationIntentRef.current = reservationIntent;
    if (previousIntent === reservationIntent) return;
    if (
      (reservationIntent === 'reserveNow' || reservationIntent === 'useExisting') &&
      clubBookingFlowActive &&
      !booktimeAuth?.connected
    ) {
      setSelectedTime('');
    }
  }, [
    reservationIntent,
    clubBookingFlowActive,
    booktimeAuth?.connected,
    setSelectedTime,
  ]);

  useEffect(() => {
    if (reservationIntent === 'manualBooked') {
      setHasBookedCourt(true);
      return;
    }
    if (reservationIntent === 'gameOnly' || reservationIntent === 'reserveNow' || reservationIntent === 'useExisting') {
      setHasBookedCourt(false);
    }
  }, [reservationIntent]);

  useEffect(() => {
    if (reservationIntent === 'manualBooked' || reservationIntent === 'gameOnly') return;
    if (selectedCourt === 'notBooked' && selectedCourtIds.length === 0) {
      setHasBookedCourt(false);
      return;
    }
    if (willBookOnCreate || locationTimeMode === 'bookings') {
      setHasBookedCourt(false);
    }
  }, [reservationIntent, selectedCourt, selectedCourtIds.length, willBookOnCreate, locationTimeMode]);

  const prevLiveApiEnabledRef = useRef(liveApiEnabled);
  useEffect(() => {
    if (prevLiveApiEnabledRef.current && !liveApiEnabled && willBookOnCreate) {
      toast(t('createGame.booktime.liveApiUnavailable'));
    }
    prevLiveApiEnabledRef.current = liveApiEnabled;
  }, [liveApiEnabled, willBookOnCreate, t]);

  useEffect(() => {
    if (!wantsReserveNowAvailability || needsBooktimeAuth || !booktimeFixedDates?.length) return;
    const clamped = clampBooktimeDate(selectedDate);
    if (format(clamped, 'yyyy-MM-dd') !== format(selectedDate, 'yyyy-MM-dd')) {
      setSelectedDate(clamped);
      setSelectedTime('');
    }
  }, [
    wantsReserveNowAvailability,
    needsBooktimeAuth,
    booktimeFixedDates,
    clampBooktimeDate,
    selectedDate,
    setSelectedDate,
    setSelectedTime,
  ]);

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
    if (wantsReserveNowAvailability || willBookOnCreate || locationTimeMode === 'bookings') return 'skip';
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
      if (overlap.hasSoftOverlap) return 'soft';
    } catch {
      return 'ok';
    }
    return 'ok';
  }, [
    willBookOnCreate,
    wantsReserveNowAvailability,
    locationTimeMode,
    entityType,
    selectedClub,
    selectedTime,
    duration,
    clubs,
    selectedDate,
    selectedCourt,
  ]);

  const resolveCreateAttempt = useCallback(async (): Promise<CreateGameAttemptResult> => {
    const overlapGate = await runBookingOverlapGate();
    return resolveCreateGameBookingAction({
      needsBooktimeAuth,
      locationTimeMode,
      selectedBookingCount: selectedBookingIds.length,
      selectedBookingRecordsCount: selectedBookingRecords.length,
      bookingSelectionMin: bookingSelectionLimits.min,
      willBookOnCreate,
      integratedCourtCount: integratedCourtIds.length,
      selectedCourt,
      selectedCourtCount: selectedCourtIds.length,
      reservationIntent,
      overlapGate,
    });
  }, [
    runBookingOverlapGate,
    needsBooktimeAuth,
    locationTimeMode,
    selectedBookingIds.length,
    selectedBookingRecords.length,
    bookingSelectionLimits.min,
    willBookOnCreate,
    integratedCourtIds.length,
    selectedCourt,
    selectedCourtIds.length,
    reservationIntent,
  ]);

  const handleCreateAttempt = useCallback(
    async (
      onProceed: (overrides?: CreateGameBookingOverrides) => Promise<void>,
      onAbort?: (reason: CreateGameAbortReason) => void,
    ) => {
      const result = await resolveCreateAttempt();
      if (result.status === 'abort') {
        const message = resolveReservationValidationMessage(
          { ok: false, reason: mapCreateAbortReasonToValidationReason(result.reason) },
          bookingSelectionLimits.min,
        );
        toast.error(t(message.key, message.values));
        onAbort?.(result.reason);
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
    [resolveCreateAttempt, bookingSelectionLimits.min, t],
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
        hasBookedCourt: reservationIntent === 'manualBooked' ? true : hasBookedCourt,
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
      reservationIntent,
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
          reservationIntent,
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
      reservationIntent,
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
        sport,
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
      sport,
      refreshSnapshot,
      snapshotLastFetchedAt,
      snapshotBlocked,
      handleSlotTaken,
    ],
  );

  const handleSelectedBookingIdsChange = useCallback(
    (ids: string[], records: BooktimeBookingRecord[] = []) => {
      setSelectedBookingIds((prev) => (areStringArraysEqual(prev, ids) ? prev : ids));
      setSelectedBookingRecords((prev) => (areBookingRecordsEqual(prev, records) ? prev : records));
      setDerivedBookingSummary((prev) => (prev.count === ids.length ? prev : { ...prev, count: ids.length }));
    },
    [setSelectedBookingIds],
  );

  const { hydrating: preselectedBookingsHydrating } = usePreselectedBookingHydration({
    initialBookingIds,
    selectedBookingIds,
    selectedBookingRecords,
    club: selectedClubData,
    companyId: booktimeIntegrationConfig?.companyId,
    matchCourts: bookingMatchCourts ?? courts,
    enabled: clubBookingFlowActive && preselectedBookings,
    onHydrated: handleSelectedBookingIdsChange,
  });

  const handleDerivedTimeChange = useCallback(
    (start: string | null, end: string | null) => {
      setDerivedBookingSummary((prev) => {
        if (prev.startTime === start && prev.endTime === end) return prev;
        return {
          startTime: start,
          endTime: end,
          count: prev.count,
        };
      });
    },
    [],
  );

  const lastSyncedScheduleKeyRef = useRef('');
  useEffect(() => {
    if (selectedBookingIds.length === 0) {
      if (timeOverride) {
        setTimeOverride(false);
      }
      lastSyncedScheduleKeyRef.current = '';
      return;
    }
    if (locationTimeMode !== 'bookings' || selectedBookingRecords.length === 0) {
      lastSyncedScheduleKeyRef.current = '';
      return;
    }

    const matchCourts = bookingMatchCourts ?? courts;
    const schedule = syncFormScheduleFromBookings({
      selectedBookings: selectedBookingRecords,
      courts: matchCourts,
      club: selectedClubData,
      timeOverride,
      overrideStartTime,
      overrideEndTime,
    });
    if (!schedule) return;

    const syncKey = [
      selectedBookingIds.join(','),
      schedule.selectedTime,
      schedule.durationHours,
      schedule.courtIds.join(','),
      timeOverride,
      overrideStartTime,
      overrideEndTime,
    ].join('|');
    if (lastSyncedScheduleKeyRef.current === syncKey) return;
    lastSyncedScheduleKeyRef.current = syncKey;

    setSelectedDate(schedule.selectedDate);
    setSelectedTime(schedule.selectedTime);
    setDuration(schedule.durationHours);
    if (schedule.courtIds.length > 0) {
      setSelectedCourtIds(schedule.courtIds);
    }
  }, [
    locationTimeMode,
    selectedBookingRecords,
    selectedBookingIds,
    bookingMatchCourts,
    courts,
    selectedClubData,
    timeOverride,
    overrideStartTime,
    overrideEndTime,
    setSelectedDate,
    setSelectedTime,
    setDuration,
    setSelectedCourtIds,
    setTimeOverride,
  ]);

  const panelDerivedSummary = useMemo(() => {
    if (
      timeOverride &&
      overrideStartTime &&
      overrideEndTime &&
      derivedBookingSummary.count > 0
    ) {
      return {
        ...derivedBookingSummary,
        startTime: overrideStartTime,
        endTime: overrideEndTime,
      };
    }
    return derivedBookingSummary;
  }, [
    timeOverride,
    overrideStartTime,
    overrideEndTime,
    derivedBookingSummary,
  ]);

  const derivedBookingWindowLabel = useMemo(() => {
    const start = panelDerivedSummary.startTime;
    const end = panelDerivedSummary.endTime;
    if (!start || !end) return null;
    const startDate = new Date(start);
    const endDate = new Date(end);
    return `${startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }, [panelDerivedSummary.startTime, panelDerivedSummary.endTime]);

  return {
    clubBookingFlowActive,
    hasBookedCourt,
    setHasBookedCourt,
    locationTimeMode,
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
    effectiveDerivedSummary: panelDerivedSummary,
    derivedBookingWindowLabel,
    integratedCourtIds,
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
    createButtonLabel: resolvedCreateButtonLabel,
    preselectedBookings,
    preselectedBookingsHydrating,
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
    onSelectedBookingIdsChange: handleSelectedBookingIdsChange,
    onDerivedTimeChange: handleDerivedTimeChange,
    reservationIntent,
    setReservationIntent,
    reservationIntentOptions,
    availableReservationCount: clubDateReservations.bookingsLoaded
      ? clubDateReservations.dateBookings.length
      : undefined,
  };
}

export type CreateGameBookingFlow = ReturnType<typeof useCreateGameBookingFlow>;
