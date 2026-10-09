/**
 * Create-game court plan: how many courts, which ones, what is already
 * reserved at the club, and what the primary button will do.
 *
 * Location step order: Club → Date → Courts → "At the club?" → Time → summary.
 *  - Courts: N slots (prefilled from the roster by `defaultCourtSlotCount`),
 *    each "Any court" or a picked court.
 *  - At the club?: Reserve now (integrated clubs; provider confirm modal books
 *    N courts) · Already reserved (link your reservations, the rest is marked
 *    `REPORTED`) · Not yet.
 *  - Time options respect occupancy: hard blocks cannot be picked, a planned
 *    game only adds a note.
 *
 * The create payload carries courts and links; the organizer's count and the
 * per-slot reports follow in `PUT /games/:id/court-slots` (explicit time
 * policy: the game keeps the time the organizer picked).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import type { TFunction } from 'i18next';
import toast from 'react-hot-toast';
import type { Club, Court, EntityType } from '@/types';
import type { Sport } from '@shared/sport';
import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import type { BookingSnapshotInput, ExternalBookingProvider } from '@shared/gameBooking/contracts';
import type { ClubScheduleSelection } from '@/components/clubPicker/clubScheduleSelection';
import { scheduleSelectionToForm } from '@/components/clubPicker/clubScheduleSelection';
import type { SummaryChipItem } from '@/components/createGame/summaryHeader/CreateGameSummaryBar';
import type { ClubCreateGameConfirmModalProps } from '@/components/createGame/ClubCreateGameConfirmModal';
import type { TimeSlotBlock } from '@/components/createGame/CreateGameTimeSlots';
import { useClubDateReservations } from '@/components/gameLocationTime/useClubDateReservations';
import { syncFormScheduleFromBookings } from '@/components/gameLocationTime/syncFormScheduleFromBookings';
import { shouldUseBooktimeTimeOptions } from '@/hooks/createGameBookingFlow/shouldUseBooktimeTimeOptions';
import { useClubTimeOptions } from '@/hooks/useClubTimeOptions';
import { useClubBookingAuth } from '@/hooks/useClubBookingAuth';
import { useClubSnapshotRefresh } from '@/hooks/useClubSnapshotRefresh';
import { useBooktimeCompanyMeta } from '@/hooks/useBooktimeCompanyMeta';
import { createDateFromClubTime, getClubTimezone } from '@/hooks/useGameTimeDuration';
import { useAuthStore } from '@/store/authStore';
import { courtSlotsApi } from '@/api/courtSlots';
import { supportsClubBookingFlow } from '@shared/gameBooking/supportsClubBookingFlow';
import { defaultCourtSlotCount } from '@shared/gameBooking/courtReservations';
import { buildBookingSnapshots } from '@shared/gameBooking/buildBookingSnapshots';
import { applyCourtIdsToBookingSnapshots } from '@shared/gameBooking/applyCourtIdsToBookingSnapshots';
import { deriveGameTimeFromBookings } from '@shared/gameBooking/deriveGameTimeFromBookings';
import {
  clubHasBookingIntegration,
  courtHasActiveBookingIntegration,
  isKlikterenClub,
  isNspadelClub,
  isPadelooClub,
  isWeltnerClub,
  parseBooktimeIntegrationConfig,
  parseKlikterenIntegrationConfig,
  parsePadelooIntegrationConfig,
} from '@shared/clubIntegration';
import {
  AT_CLUB_CHOICES,
  assignSlotCourt,
  assignedCourtIds,
  buildCreateCourtSlotsBody,
  clearLinkedBookings,
  courtPlanIssueKey,
  courtSlotBounds,
  courtStatesForWindow,
  fillAnyCourtSlots,
  legacyHasBookedCourt,
  resizeCourtSlots,
  resolveCourtPlanCta,
  resolveInitialAtClubChoice,
  resolvePlanTimeBlock,
  seedCourtSlots,
  setSlotReported,
  setSlotsReported,
  syncLinkedBookings,
  validateCourtPlan,
  type AtClubChoice,
  type CourtPlanIssue,
  type CourtPlanSlot,
  type CourtWindowState,
  type CreateCourtSlotsBody,
  type PlanTimeBlock,
} from './courtPlanModel';
import { useCreateGameOccupancy } from './useCreateGameOccupancy';

type TimeOptionHelpers = {
  generateTimeOptions: () => string[];
  generateTimeOptionsForDate: (date: Date) => string[];
  canAccommodateDuration: (time: string, duration: number) => boolean;
  getAdjustedStartTime: (clickedTime: string, duration: number) => string | null;
  getTimeSlotsForDuration: (startTime: string, duration: number) => string[];
  isSlotHighlighted: (time: string) => boolean;
};

export type CourtPlanInitial = {
  /** Club the draft opened with; its courts / reservation hints apply only there. */
  clubId: string;
  courtIds: string[];
  courtSlotCount: number | null;
  hasBookedCourt: boolean;
  bookingIds: string[];
  fromPlayIntent: boolean;
  hasStartTime: boolean;
};

export type CourtPlanCreateFields = {
  courtId?: string;
  courtIds?: string[];
  startTime: string;
  endTime: string;
  timeOverride: boolean;
  hasBookedCourt: boolean;
  externalBookingIds?: string[];
  externalBookingProvider?: ExternalBookingProvider;
  bookingSnapshots?: BookingSnapshotInput[];
  courtSlotsBody: CreateCourtSlotsBody | null;
};

export type CourtPlanBookingOverrides = {
  externalBookingIds: string[];
  bookingSnapshots: BookingSnapshotInput[];
};

/** What "Use the reservation's time?" offers, in club time. */
export type ReservationTimePrompt = {
  key: string;
  reservation: { time: string; duration: number };
  previous: { date: Date; time: string; duration: number };
};

type Args = {
  entityType: EntityType;
  sport: Sport;
  /** Selected club id (known before the club's data loads). */
  clubId: string;
  club: Club | undefined;
  /** Sport-compatible courts of the club (what a slot may take). */
  courts: Court[];
  /** Every court of the club (matches provider reservations to courts). */
  matchCourts: Court[];
  maxParticipants: number;
  playersPerMatch: number;
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  selectedTime: string;
  setSelectedTime: (time: string) => void;
  duration: number;
  setDuration: (duration: number) => void;
  storedInitialDate: Date;
  baseTimeOptions: TimeOptionHelpers;
  createDateFromSelection: () => { startTime: string; endTime: string };
  initial: CourtPlanInitial;
  t: TFunction;
};

const providerOf = (club: Club | undefined): ExternalBookingProvider =>
  isWeltnerClub(club)
    ? 'WELTNER'
    : isPadelooClub(club)
      ? 'PADELOO'
      : isKlikterenClub(club)
        ? 'KLIKTEREN'
        : isNspadelClub(club)
          ? 'NSPADELSUPABASE'
          : 'BOOKTIME';

function sameInstant(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return Date.parse(a) === Date.parse(b);
}

export function useCreateGameCourtPlan({
  entityType,
  sport,
  clubId,
  club,
  courts,
  matchCourts,
  maxParticipants,
  playersPerMatch,
  selectedDate,
  setSelectedDate,
  selectedTime,
  setSelectedTime,
  duration,
  setDuration,
  storedInitialDate,
  baseTimeOptions,
  createDateFromSelection,
  initial,
  t,
}: Args) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isBar = entityType === 'BAR';
  const integrated = clubHasBookingIntegration(club);
  const bookingFlow = Boolean(club) && supportsClubBookingFlow(entityType, 'create');
  const canReserveNow = bookingFlow && integrated;

  const booktimeConfig = useMemo(
    () => (club && integrated ? parseBooktimeIntegrationConfig(club.integrationConfig) : null),
    [club, integrated],
  );
  const padelooConfig = useMemo(
    () => (club && isPadelooClub(club) ? parsePadelooIntegrationConfig(club.integrationConfig) : null),
    [club],
  );
  const klikterenConfig = useMemo(
    () => (club && isKlikterenClub(club) ? parseKlikterenIntegrationConfig(club.integrationConfig) : null),
    [club],
  );
  /** Providers whose reservations we can list for this player. */
  const canListReservations =
    canReserveNow &&
    Boolean(booktimeConfig?.companyId || padelooConfig?.clubId || klikterenConfig?.venueId || isWeltnerClub(club));

  /* ---------------- slots ---------------- */

  const rosterCount = defaultCourtSlotCount({ maxParticipants, playersPerMatch });
  const [slots, setSlots] = useState<CourtPlanSlot[]>(() =>
    seedCourtSlots(initial.courtIds, isBar ? 1 : (initial.courtSlotCount ?? Math.max(rosterCount, initial.courtIds.length))),
  );
  const [countTouched, setCountTouched] = useState(() => initial.courtSlotCount != null || initial.courtIds.length > 1);

  /* ---------------- At the club? ---------------- */

  const isInitialClub = clubId !== '' && clubId === initial.clubId;
  /** The answer a fresh draft starts with; the player's own answer overrides it. */
  const autoChoice = resolveInitialAtClubChoice({
    canReserveNow,
    hasPreselectedBookings: isInitialClub && initial.bookingIds.length > 0,
    initialHasBookedCourt: isInitialClub && initial.hasBookedCourt,
    fromPlayIntent: initial.fromPlayIntent,
  });
  const [choiceOverride, setChoiceOverride] = useState<AtClubChoice | null>(null);
  const choices = useMemo<AtClubChoice[]>(
    () => AT_CLUB_CHOICES.filter((c) => c !== 'reserveNow' || canReserveNow),
    [canReserveNow],
  );
  const wanted = choiceOverride ?? autoChoice;
  const effectiveChoice: AtClubChoice | null = isBar ? null : choices.includes(wanted) ? wanted : 'notYet';

  const [linkedRecords, setLinkedRecords] = useState<BooktimeBookingRecord[]>([]);
  const [pendingBookingIds, setPendingBookingIds] = useState<string[]>(initial.bookingIds);

  const setChoice = useCallback((next: AtClubChoice) => setChoiceOverride(next), []);

  // Marked-reserved slots and links follow the answer.
  const prevChoiceRef = useRef<AtClubChoice | null>(null);
  useEffect(() => {
    if (prevChoiceRef.current === effectiveChoice) return;
    prevChoiceRef.current = effectiveChoice;
    const reserved = effectiveChoice === 'alreadyReserved';
    setSlots((prev) => setSlotsReported(reserved ? prev : clearLinkedBookings(prev), reserved));
    if (!reserved) {
      setLinkedRecords([]);
      setPendingBookingIds([]);
    }
  }, [effectiveChoice]);

  /* ---------------- club change ---------------- */

  const prevClubIdRef = useRef(clubId);
  useEffect(() => {
    if (prevClubIdRef.current === clubId) return;
    prevClubIdRef.current = clubId;
    setChoiceOverride(null);
    setLinkedRecords([]);
    setPendingBookingIds([]);
    setSlots((prev) => seedCourtSlots([], prev.length));
  }, [clubId]);

  /* ---------------- count ---------------- */

  const linkedCount = slots.filter((s) => s.bookingId).length;
  const bounds = courtSlotBounds(courts.length, linkedCount, rosterCount);
  const reportedDefault = effectiveChoice === 'alreadyReserved';

  // Until the organizer touches the stepper, N follows the roster (capped by the club's courts).
  const courtCount = courts.length;
  // After a touch, N still never exceeds what the roster needs (a smaller roster shrinks it).
  useEffect(() => {
    if (isBar) return;
    setSlots((prev) => {
      const linked = prev.filter((s) => s.bookingId).length;
      const cap = courtCount > 0 ? Math.max(courtCount, linked) : Number.POSITIVE_INFINITY;
      const need = Math.max(rosterCount, linked);
      const target = countTouched ? Math.min(prev.length, need) : Math.min(cap, need);
      return prev.length === target ? prev : resizeCourtSlots(prev, target, reportedDefault);
    });
  }, [isBar, countTouched, rosterCount, courtCount, reportedDefault]);

  const setCount = useCallback(
    (count: number) => {
      setCountTouched(true);
      setSlots((prev) => resizeCourtSlots(prev, Math.min(bounds.max, Math.max(bounds.min, count)), reportedDefault));
    },
    [bounds.max, bounds.min, reportedDefault],
  );

  const setSlotCourt = useCallback((index: number, courtId: string | null) => {
    setSlots((prev) => assignSlotCourt(prev, index, courtId));
  }, []);

  const markSlotReported = useCallback((index: number, reported: boolean) => {
    setSlots((prev) => setSlotReported(prev, index, reported));
  }, []);

  /** Put these courts first (deep link, duplicate, club page selection, single-court club). */
  const seedCourts = useCallback(
    (ids: string[]) => {
      setSlots((prev) => {
        const kept = prev.filter((s) => s.bookingId);
        if (kept.length > 0) return prev;
        return seedCourtSlots(ids, isBar ? 1 : Math.max(prev.length, ids.length), prev[0]?.reported ?? false);
      });
    },
    [isBar],
  );

  /** Drop courts that are no longer offered (sport switch). */
  const courtIdsKey = courts.map((c) => c.id).join(',');
  useEffect(() => {
    if (!courtIdsKey) return;
    const valid = new Set(courtIdsKey ? courtIdsKey.split(',') : []);
    setSlots((prev) =>
      prev.some((s) => s.courtId && !s.bookingId && !valid.has(s.courtId))
        ? prev.map((s) => (s.courtId && !s.bookingId && !valid.has(s.courtId) ? { ...s, courtId: null } : s))
        : prev,
    );
  }, [courtIdsKey]);

  const assignedIds = useMemo(() => assignedCourtIds(slots), [slots]);

  /* ---------------- provider auth, snapshot, time options ---------------- */

  const { status: auth, refresh: refreshAuth } = useClubBookingAuth(club, canReserveNow);
  const connected = Boolean(auth?.connected);
  const needsAuth = canReserveNow && !connected && effectiveChoice === 'reserveNow';
  const reserveNowActive = effectiveChoice === 'reserveNow' && canReserveNow && connected;

  const snapshotEnabled = Boolean(club) && integrated && isAuthenticated && !isBar;
  const {
    refreshSnapshot,
    snapshotBanner,
    lastFetchedAt,
    isRefreshingSnapshot,
  } = useClubSnapshotRefresh(club, selectedDate, snapshotEnabled, {
    durationMinutes: Math.round(duration * 60),
  });

  const companyMeta = useBooktimeCompanyMeta(club, reserveNowActive);
  const { clampDate, fixedDates } = companyMeta;

  const bookableCourtIds = useMemo(
    () => new Set(courts.filter((c) => courtHasActiveBookingIntegration(club, c)).map((c) => c.id)),
    [courts, club],
  );
  const pickedBookable = useMemo(
    () => assignedIds.filter((id) => bookableCourtIds.has(id)),
    [assignedIds, bookableCourtIds],
  );

  const providerTimeOptions = useClubTimeOptions({
    club,
    courts,
    selectedDate,
    durationHours: duration,
    selectedCourtId: null,
    selectedCourtIds: pickedBookable.length > 0 ? pickedBookable : undefined,
    enabled: shouldUseBooktimeTimeOptions({
      entityType,
      clubHasBookingIntegration: integrated,
      needsBooktimeAuth: needsAuth,
      locationTimeMode: 'timeSlots',
      willBookOnCreate: reserveNowActive,
      booktimeConnected: connected,
      isPadelooClub: isPadelooClub(club),
      isKlikterenClub: isKlikterenClub(club),
      isNspadelClub: isNspadelClub(club),
    }),
  });
  const providerActive = providerTimeOptions.active && reserveNowActive;
  const timeOptions = useMemo(
    () =>
      providerActive
        ? {
            generateTimeOptions: providerTimeOptions.generateTimeOptions,
            generateTimeOptionsForDate: providerTimeOptions.generateTimeOptionsForDate,
            canAccommodateDuration: providerTimeOptions.canAccommodateDuration,
            getAdjustedStartTime: providerTimeOptions.getAdjustedStartTime,
            getTimeSlotsForDuration: providerTimeOptions.getTimeSlotsForDuration,
            isSlotHighlighted: (time: string) => providerTimeOptions.isSlotHighlighted(time, selectedTime, duration),
          }
        : baseTimeOptions,
    [providerActive, providerTimeOptions, baseTimeOptions, selectedTime, duration],
  );

  // Booktime only sells a window of days: keep the date inside it.
  useEffect(() => {
    if (!reserveNowActive || !fixedDates?.length) return;
    const clamped = clampDate(selectedDate);
    if (format(clamped, 'yyyy-MM-dd') !== format(selectedDate, 'yyyy-MM-dd')) {
      setSelectedDate(clamped);
      setSelectedTime('');
    }
  }, [reserveNowActive, fixedDates, clampDate, selectedDate, setSelectedDate, setSelectedTime]);

  // First date for a new club: today, or tomorrow when today has no slots left.
  const optionsForDateRef = useRef(timeOptions.generateTimeOptionsForDate);
  optionsForDateRef.current = timeOptions.generateTimeOptionsForDate;
  const initialDateClubRef = useRef<string | null>(null);
  const providerLoading = providerTimeOptions.active && providerTimeOptions.loading;
  useEffect(() => {
    if (initial.hasStartTime || !club || courts.length === 0 || providerLoading) return;
    if (initialDateClubRef.current === club.id) return;
    initialDateClubRef.current = club.id;
    if (optionsForDateRef.current(storedInitialDate).length > 0) {
      setSelectedDate(storedInitialDate);
      return;
    }
    const tomorrow = new Date(storedInitialDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    setSelectedDate(optionsForDateRef.current(tomorrow).length > 0 ? tomorrow : storedInitialDate);
  }, [initial.hasStartTime, club, courts.length, providerLoading, storedInitialDate, setSelectedDate]);

  /* ---------------- reservations (Already reserved) ---------------- */

  // Loaded whenever the player is connected: also powers the "you have a reservation" nudge.
  const listReservations = canListReservations && connected;
  const reservations = useClubDateReservations({
    club,
    selectedDate,
    enabled: listReservations,
    matchCourts,
  });
  const clubTimeZone = getClubTimezone(club);

  const courtForRecord = useCallback(
    (record: BooktimeBookingRecord): string | null =>
      buildBookingSnapshots([record], matchCourts, { timeZone: clubTimeZone })[0]?.courtId ?? null,
    [matchCourts, clubTimeZone],
  );

  const [timePrompt, setTimePrompt] = useState<ReservationTimePrompt | null>(null);
  const answeredPromptsRef = useRef(new Map<string, 'use' | 'keep'>());

  const applyReservationTime = useCallback(
    (records: BooktimeBookingRecord[], { silent }: { silent: boolean }) => {
      if (records.length === 0) {
        setTimePrompt(null);
        return;
      }
      const schedule = syncFormScheduleFromBookings({
        selectedBookings: records,
        courts: matchCourts,
        club,
        timeOverride: false,
      });
      if (!schedule) return;
      const key = records
        .map((r) => r.uuid)
        .sort()
        .join(',');
      const sameDay = format(schedule.selectedDate, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd');
      const same = sameDay && schedule.selectedTime === selectedTime && Math.abs(schedule.durationHours - duration) < 1e-6;
      if (same) {
        setTimePrompt(null);
        return;
      }
      if (answeredPromptsRef.current.get(key) === 'keep') return;
      const previous = { date: selectedDate, time: selectedTime, duration };
      setSelectedDate(schedule.selectedDate);
      setSelectedTime(schedule.selectedTime);
      setDuration(schedule.durationHours);
      if (silent || !selectedTime || answeredPromptsRef.current.has(key)) {
        setTimePrompt(null);
        return;
      }
      setTimePrompt({
        key,
        reservation: { time: schedule.selectedTime, duration: schedule.durationHours },
        previous,
      });
    },
    [matchCourts, club, selectedDate, selectedTime, duration, setSelectedDate, setSelectedTime, setDuration],
  );

  const linkRecords = useCallback(
    (records: BooktimeBookingRecord[], options: { silent: boolean }) => {
      setLinkedRecords(records);
      setSlots((prev) =>
        setSlotsReported(
          syncLinkedBookings(
            prev,
            records.map((r) => ({ id: r.uuid, courtId: courtForRecord(r) })),
          ),
          true,
        ),
      );
      if (records.length > 0) setCountTouched(true);
      applyReservationTime(records, options);
    },
    [courtForRecord, applyReservationTime],
  );

  const toggleReservation = useCallback(
    (record: BooktimeBookingRecord) => {
      const selected = linkedRecords.some((r) => r.uuid === record.uuid);
      const next = selected ? linkedRecords.filter((r) => r.uuid !== record.uuid) : [...linkedRecords, record];
      linkRecords(next, { silent: false });
    },
    [linkedRecords, linkRecords],
  );

  // Deep link `?bookingIds=` / club page: link once the player's reservations load.
  useEffect(() => {
    if (pendingBookingIds.length === 0 || !reservations.bookingsLoaded) return;
    const records = pendingBookingIds
      .map((id) => reservations.bookings.find((b) => b.uuid === id))
      .filter((r): r is BooktimeBookingRecord => r != null);
    setPendingBookingIds([]);
    if (records.length === 0) return;
    setChoiceOverride('alreadyReserved');
    linkRecords(records, { silent: true });
  }, [pendingBookingIds, reservations.bookingsLoaded, reservations.bookings, linkRecords]);

  // Nothing to link with (no listing at this club, or not connected): fall back to "mark as reserved".
  useEffect(() => {
    if (pendingBookingIds.length === 0 || !club) return;
    if (!canListReservations || (auth != null && !auth.connected)) setPendingBookingIds([]);
  }, [pendingBookingIds.length, club, canListReservations, auth]);

  // A reservation that is gone from the list for this date (other day picked) is unlinked.
  useEffect(() => {
    if (!reservations.bookingsLoaded || linkedRecords.length === 0) return;
    const available = new Set(reservations.dateBookings.map((b) => b.uuid));
    const kept = linkedRecords.filter((r) => available.has(r.uuid));
    if (kept.length !== linkedRecords.length) linkRecords(kept, { silent: true });
  }, [reservations.bookingsLoaded, reservations.dateBookings, linkedRecords, linkRecords]);

  const answerTimePrompt = useCallback(
    (answer: 'use' | 'keep') => {
      if (!timePrompt) return;
      answeredPromptsRef.current.set(timePrompt.key, answer);
      if (answer === 'keep') {
        setSelectedDate(timePrompt.previous.date);
        setSelectedTime(timePrompt.previous.time);
        setDuration(timePrompt.previous.duration);
      }
      setTimePrompt(null);
    },
    [timePrompt, setSelectedDate, setSelectedTime, setDuration],
  );

  /* ---------------- occupancy ---------------- */

  const occupancy = useCreateGameOccupancy({
    club,
    selectedDate,
    enabled: Boolean(club) && !isBar,
    refreshSnapshot: snapshotEnabled ? refreshSnapshot : undefined,
  });
  const courtIds = useMemo(() => courts.map((c) => c.id), [courts]);
  const poolCourtIds = useMemo(
    () => (effectiveChoice === 'reserveNow' ? courtIds.filter((id) => bookableCourtIds.has(id)) : courtIds),
    [effectiveChoice, courtIds, bookableCourtIds],
  );
  const courtNameById = useMemo(() => new Map(courts.map((c) => [c.id, c.name])), [courts]);

  const statesAt = useCallback(
    (time: string): Map<string, CourtWindowState> | null => {
      if (!club || !time || !duration) return null;
      const start = createDateFromClubTime(selectedDate, time, club).getTime();
      return courtStatesForWindow(occupancy.blocks, courtIds, start, start + duration * 3_600_000);
    },
    [club, selectedDate, duration, occupancy.blocks, courtIds],
  );

  const planBlockAt = useCallback(
    (time: string): PlanTimeBlock | null => {
      const states = statesAt(time);
      if (!states) return null;
      return resolvePlanTimeBlock({
        slots,
        states,
        poolCourtIds,
        trustReported: effectiveChoice === 'alreadyReserved',
      });
    },
    [statesAt, slots, poolCourtIds, effectiveChoice],
  );

  const describeBlock = useCallback(
    (block: PlanTimeBlock): string => {
      if (block.kind === 'soft') return t('createGame.courtPlan.time.softNote');
      if (block.reason === 'notEnoughCourts') {
        return t('createGame.courtPlan.time.notEnoughCourts', { free: block.free, needed: block.needed });
      }
      const court = courtNameById.get(block.courtId) ?? '';
      if (block.reason === 'hold') return t('createGame.courtPlan.time.hold', { court });
      if (block.reason === 'app_game_reserved') return t('createGame.courtPlan.time.reservedGame', { court });
      return t('createGame.courtPlan.time.club', { court });
    },
    [t, courtNameById],
  );

  /**
   * Way out of a hard block: the organizer booked it another way (their own club
   * booking, by phone) → Already booked; reported courts are exempt from the check.
   */
  const blockActions = useCallback(
    (block: PlanTimeBlock): TimeSlotBlock['actions'] => {
      if (block.kind !== 'hard' || (effectiveChoice !== 'notYet' && effectiveChoice !== 'reserveNow')) return undefined;
      return [{ id: 'mine', label: t('createGame.courtPlan.time.mineAction'), onSelect: () => setChoiceOverride('alreadyReserved') }];
    },
    [effectiveChoice, t],
  );

  const slotBlock = useCallback(
    (time: string): TimeSlotBlock | null => {
      if (isBar) return null;
      const block = planBlockAt(time);
      return block ? { kind: block.kind, reason: describeBlock(block), actions: blockActions(block) } : null;
    },
    [isBar, planBlockAt, describeBlock, blockActions],
  );

  const selectedStates = useMemo(() => statesAt(selectedTime), [statesAt, selectedTime]);
  const selectedBlock = useMemo(() => (isBar ? null : planBlockAt(selectedTime)), [isBar, planBlockAt, selectedTime]);

  /** Reserve now: every "Any court" gets a concrete, bookable court for the chosen time. */
  const filledSlots = useMemo(() => {
    if (effectiveChoice !== 'reserveNow') return slots;
    return fillAnyCourtSlots(slots, selectedStates ?? new Map(), poolCourtIds);
  }, [effectiveChoice, slots, selectedStates, poolCourtIds]);

  /* ---------------- validation, button ---------------- */

  const validation = useMemo(
    () =>
      isBar
        ? selectedTime
          ? ({ ok: true } as const)
          : ({ ok: false, reason: 'timeRequired' } as const)
        : validateCourtPlan({
            choice: effectiveChoice,
            needsAuth,
            selectedTime,
            duration,
            timeBlock: selectedBlock,
            slots,
            bookableCourtIds,
            anyCourtsFillable: filledSlots != null,
            pendingReservationCount: effectiveChoice === 'alreadyReserved' ? pendingBookingIds.length : 0,
          }),
    [
      isBar,
      effectiveChoice,
      needsAuth,
      selectedTime,
      duration,
      selectedBlock,
      slots,
      bookableCourtIds,
      filledSlots,
      pendingBookingIds.length,
    ],
  );

  const issueMessage = useCallback(
    (reason: CourtPlanIssue) => t(courtPlanIssueKey(reason), { count: slots.length }),
    [t, slots.length],
  );

  const cta = resolveCourtPlanCta({ entityType, choice: effectiveChoice, slots });
  const createButtonLabel = t(cta.key, cta.values);

  /* ---------------- create ---------------- */

  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleCreateAttempt = useCallback(
    async (onProceed: () => Promise<void>, onAbort?: (reason: CourtPlanIssue) => void) => {
      if (!validation.ok) {
        toast.error(issueMessage(validation.reason));
        onAbort?.(validation.reason);
        return;
      }
      if (effectiveChoice === 'reserveNow') {
        setConfirmOpen(true);
        return;
      }
      await onProceed();
    },
    [validation, issueMessage, effectiveChoice],
  );

  // A booking dialog never survives a change of what it would book.
  const confirmKeyRef = useRef<string | null>(null);
  const confirmKey = `${club?.id}|${selectedTime}|${duration}|${format(selectedDate, 'yyyy-MM-dd')}|${assignedIds.join(',')}|${slots.length}`;
  useEffect(() => {
    if (!confirmOpen) {
      confirmKeyRef.current = null;
      return;
    }
    if (confirmKeyRef.current == null) confirmKeyRef.current = confirmKey;
    else if (confirmKeyRef.current !== confirmKey) setConfirmOpen(false);
  }, [confirmOpen, confirmKey]);

  const buildCreateFields = useCallback(
    async (overrides?: CourtPlanBookingOverrides): Promise<CourtPlanCreateFields> => {
      const window = createDateFromSelection();
      if (isBar) {
        const courtId = slots[0]?.courtId ?? undefined;
        return {
          courtId,
          courtIds: courtId ? [courtId] : undefined,
          ...window,
          timeOverride: false,
          hasBookedCourt: false,
          courtSlotsBody: null,
        };
      }

      let planSlots: CourtPlanSlot[];
      let snapshots: BookingSnapshotInput[];
      let externalBookingIds: string[];
      if (overrides) {
        // Reserve now: the dialog booked one court per slot.
        const byCourt = new Map(
          overrides.bookingSnapshots.filter((s) => s.courtId).map((s) => [s.courtId as string, s.externalBookingId]),
        );
        planSlots = (filledSlots ?? slots).map((s) => ({
          ...s,
          bookingId: (s.courtId && byCourt.get(s.courtId)) || s.bookingId,
          reported: false,
        }));
        snapshots = overrides.bookingSnapshots;
        externalBookingIds = overrides.externalBookingIds;
      } else {
        planSlots = slots;
        const linked = effectiveChoice === 'alreadyReserved' ? linkedRecords : [];
        if (linked.length > 0 && snapshotEnabled) await refreshSnapshot({ force: true });
        snapshots = buildBookingSnapshots(linked, matchCourts, { timeZone: clubTimeZone });
        externalBookingIds = linked.map((r) => r.uuid);
      }

      const courtIdsForGame = assignedCourtIds(planSlots);
      const derived = snapshots.length > 0 ? deriveGameTimeFromBookings(snapshots, { timeZone: clubTimeZone }) : null;
      const timeOverride =
        externalBookingIds.length > 0 &&
        !(sameInstant(derived?.startTime, window.startTime) && sameInstant(derived?.endTime, window.endTime));

      return {
        courtId: courtIdsForGame[0],
        courtIds: courtIdsForGame.length > 0 ? courtIdsForGame : undefined,
        ...window,
        timeOverride,
        hasBookedCourt: externalBookingIds.length > 0 || legacyHasBookedCourt(planSlots),
        externalBookingIds: externalBookingIds.length > 0 ? externalBookingIds : undefined,
        externalBookingProvider: externalBookingIds.length > 0 ? providerOf(club) : undefined,
        bookingSnapshots:
          snapshots.length > 0 ? applyCourtIdsToBookingSnapshots(snapshots, courtIdsForGame) : undefined,
        courtSlotsBody: buildCreateCourtSlotsBody(planSlots),
      };
    },
    [
      createDateFromSelection,
      isBar,
      slots,
      filledSlots,
      effectiveChoice,
      linkedRecords,
      snapshotEnabled,
      refreshSnapshot,
      matchCourts,
      clubTimeZone,
      club,
    ],
  );

  /** After `POST /games`: the organizer's count and per-slot reports (explicit time policy). */
  const saveCourtSlotsAfterCreate = useCallback(
    async (gameId: string, fields: CourtPlanCreateFields) => {
      if (!fields.courtSlotsBody || !gameId) return;
      try {
        await courtSlotsApi.putCourtSlots(gameId, fields.courtSlotsBody);
      } catch (error) {
        console.error('Failed to save court slots after create:', error);
        toast.error(t('createGame.courtPlan.courtsSaveFailed'));
      }
    },
    [t],
  );

  const handleSlotTaken = useCallback(() => {
    setSelectedTime('');
    providerTimeOptions.reload();
    void occupancy.refetch();
  }, [setSelectedTime, providerTimeOptions, occupancy]);

  const snapshotBlocked = snapshotBanner === 'noSyncToday' || (snapshotBanner === 'scoutPoolEmpty' && !lastFetchedAt);

  const getConfirmModalProps = useCallback(
    (args: {
      summaryChips: SummaryChipItem[];
      onExecuteCreateGame: (overrides: {
        externalBookingIds: string[];
        bookingSnapshots: BookingSnapshotInput[];
        hasBookedCourt: true;
      }) => Promise<void>;
      onSuccess: () => void;
    }): ClubCreateGameConfirmModalProps | null => {
      if (!club || !confirmOpen || !filledSlots) return null;
      const bookings = filledSlots
        .map((s) => (s.courtId ? courts.find((c) => c.id === s.courtId) : undefined))
        .filter((c): c is Court => c != null)
        .map((court) => ({
          court,
          date: selectedDate,
          startTime: selectedTime,
          durationMinutes: Math.round(duration * 60),
        }));
      const shared = {
        open: confirmOpen,
        onOpenChange: setConfirmOpen,
        club,
        bookings,
        sport,
        summaryChips: args.summaryChips,
        bookFlowContext: { refreshSnapshot, lastFetchedAt },
        snapshotBlocked,
        onExecuteCreateGame: args.onExecuteCreateGame,
        onSlotTaken: handleSlotTaken,
        onSuccess: () => {
          setConfirmOpen(false);
          args.onSuccess();
        },
      };
      if (padelooConfig) {
        return {
          provider: 'PADELOO',
          padelooClubId: padelooConfig.clubId,
          email: auth?.email ?? null,
          firstName: auth?.firstName ?? null,
          lastName: auth?.lastName ?? null,
          ...shared,
        };
      }
      if (klikterenConfig) {
        return {
          provider: 'KLIKTEREN',
          klikterenVenueId: klikterenConfig.venueId,
          email: auth?.email ?? null,
          firstName: auth?.firstName ?? null,
          lastName: auth?.lastName ?? null,
          ...shared,
        };
      }
      if (isWeltnerClub(club)) return { provider: 'WELTNER', ...shared };
      if (isNspadelClub(club)) return { provider: 'NSPADELSUPABASE', ...shared };
      if (!booktimeConfig) return null;
      return {
        provider: 'BOOKTIME',
        companyId: booktimeConfig.companyId,
        phoneNumber: auth?.phoneNumber ?? null,
        firstName: auth?.firstName ?? null,
        lastName: auth?.lastName ?? null,
        allowedHoursToCancel: companyMeta.allowedHoursToCancel,
        currency: companyMeta.currency,
        ...shared,
      };
    },
    [
      club,
      confirmOpen,
      filledSlots,
      courts,
      selectedDate,
      selectedTime,
      duration,
      sport,
      refreshSnapshot,
      lastFetchedAt,
      snapshotBlocked,
      handleSlotTaken,
      padelooConfig,
      klikterenConfig,
      booktimeConfig,
      auth?.email,
      auth?.firstName,
      auth?.lastName,
      auth?.phoneNumber,
      companyMeta.allowedHoursToCancel,
      companyMeta.currency,
    ],
  );

  const onAuthConnected = useCallback(() => {
    void refreshAuth();
    if (fixedDates?.length) {
      const clamped = clampDate(selectedDate);
      if (format(clamped, 'yyyy-MM-dd') !== format(selectedDate, 'yyyy-MM-dd')) {
        setSelectedDate(clamped);
        setSelectedTime('');
      }
    }
  }, [refreshAuth, fixedDates, clampDate, selectedDate, setSelectedDate, setSelectedTime]);

  /* ---------------- club page schedule picker ---------------- */

  const applyClubScheduleSelection = useCallback(
    (selection: ClubScheduleSelection) => {
      const schedule = scheduleSelectionToForm(selection);
      prevClubIdRef.current = selection.club.id;
      initialDateClubRef.current = selection.club.id;
      setSelectedDate(schedule.selectedDate);
      setSelectedTime(schedule.selectedTime);
      setDuration(schedule.durationHours);
      setSlots((prev) => seedCourtSlots(schedule.courtIds, prev.length, Boolean(selection.booking)));
      if (selection.booking) {
        prevChoiceRef.current = 'alreadyReserved';
        setChoiceOverride('alreadyReserved');
        answeredPromptsRef.current.set(selection.booking.uuid, 'use');
        linkRecords([selection.booking], { silent: true });
      } else {
        setChoiceOverride(null);
      }
    },
    [setSelectedDate, setSelectedTime, setDuration, linkRecords],
  );

  return {
    // slots
    slots,
    filledSlots,
    count: slots.length,
    countBounds: bounds,
    setCount,
    setSlotCourt,
    markSlotReported,
    seedCourts,
    assignedCourtIds: assignedIds,
    bookableCourtIds,
    courtStatesAtSelectedTime: selectedStates,
    // at the club
    choice: effectiveChoice,
    choices,
    setChoice,
    canReserveNow,
    canListReservations,
    // provider
    auth,
    connected,
    needsAuth,
    booktimeConfig,
    onAuthConnected,
    companyMeta,
    reserveNowActive,
    providerTimeOptions,
    providerActive,
    timeOptions,
    snapshotBanner,
    isRefreshingSnapshot,
    // reservations
    reservations,
    linkedRecords,
    toggleReservation,
    pendingReservations: pendingBookingIds.length > 0,
    timePrompt,
    answerTimePrompt,
    // occupancy
    slotBlock,
    selectedBlock,
    describeBlock,
    occupancyLoading: occupancy.loading,
    // create
    validation,
    issueMessage,
    createButtonLabel,
    handleCreateAttempt,
    buildCreateFields,
    saveCourtSlotsAfterCreate,
    getConfirmModalProps,
    applyClubScheduleSelection,
  };
}

export type CreateGameCourtPlan = ReturnType<typeof useCreateGameCourtPlan>;
