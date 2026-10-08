/**
 * "When and where" — the Edit dialog's tab for a game's club, date, time,
 * duration, courts and their bookings (docs/domains/booking.md "When and
 * where"). Every "change time / club / court" tap on the game page opens the
 * dialog here; `focus` scrolls to the part that was tapped. The state lives in
 * this hook (owned by the dialog), so switching tabs keeps the draft.
 *
 * Bookings, in the same tab:
 *  - while the draft matches the saved game, the courts' booking rows are live
 *    (`useGameCourts`): tap a court to book it, use a booking already made,
 *    mark it booked another way, link, remove or cancel — the court sheet
 *    opens over the dialog;
 *  - a court the club shows taken at the new time: checked against the
 *    organizer's club account — "Use my booking" (linked on save), someone
 *    else's (free courts offered as chips), or "I booked it another way";
 *  - a game with linked bookings (or several courts) that moves: one row per
 *    court with what happens to it (keep / move / switch court …, from the
 *    reschedule planner); Save runs those club changes as a checklist here;
 *  - removing the club or the date and time while bookings are linked: per
 *    booking, keep it at the club (removed from the game) or cancel it there;
 *  - any other change: the courts are booked after saving.
 * Courts are picked, never counted: the roster decides how many.
 *
 * Saving without the club changes: `PUT /games/:id?timePolicy=explicit` then
 * `PUT /games/:id/court-slots` (`saveEditLocationTime`). A "Game only" game
 * becomes a club-booking game on its next schedule save.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { addHours } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, TriangleAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import type { Club, Court, Game } from '@/types';
import { clubsApi, courtsApi, gamesApi } from '@/api';
import { courtSlotsApi } from '@/api/courtSlots';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { identityKey, useStableIdentity } from '@/hooks/useStableIdentity';
import { useAuthStore } from '@/store/authStore';
import { createDateFromClubTime, useGameTimeDuration } from '@/hooks/useGameTimeDuration';
import { checkBookingOverlap, fetchBookedCourtsForDay } from '@/utils/bookedCourts/overlapCheck';
import { courtMatchesSportFilter } from '@/utils/courtSport';
import { getClubTimezone } from '@/utils/gameTimeDisplay';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { defaultCourtSlotCount } from '@shared/gameBooking/courtReservations';
import { MINUTE_MS, parseInstantMs, type IsoInterval } from '@shared/gameBooking/coverageIntervals';
import { providerDisplayName } from '@shared/gameBooking/reservationCopy';
import { supportsClubBookingFlow } from '@shared/gameBooking/supportsClubBookingFlow';
import { playersPerMatchOf } from '@shared/matchFormat';
import { WeatherPreviewCard } from '@/components/weather/WeatherPreviewCard';
import { ClubPoliciesBlock } from '@/components/createGame/ClubPoliciesBlock';
import { LocationTimeTab } from '@/components/GameDetails/editGameInfo/LocationTimeTab';
import type { WhereTabState } from '@/components/GameDetails/editGameInfo/locationTimeTypes';
import {
  buildEditLocationTimeRequests,
  currentCourtSlotCount,
  initialCourtIds,
  saveEditLocationTime,
  timeChanged,
} from '@/components/GameDetails/editGameInfo/saveEditLocationTime';
import { ClubBookingClaimCard } from '@/components/GameDetails/editGameInfo/ClubBookingClaimCard';
import { useOwnClubBookings } from '@/components/GameDetails/editGameInfo/useOwnClubBookings';
import {
  findClubBookingConflicts,
  reportedCourtIdsOf,
  verifyClubBookingConflict,
  type ClubBookingConflict,
  type OwnClubBooking,
} from '@/components/GameDetails/editGameInfo/clubBookingClaims';
import {
  courtClashDetails,
  describeCourtClash,
  gameWindow,
  linkedCourtIds,
  rescheduleNeeded,
} from '@/components/GameDetails/courts/gameCourtsModel';
import { createClubTimeFormatter } from '@/features/court-reservations/clubTime';
import { useCourtReservationText } from '@/features/court-reservations/useCourtReservationText';
import { useReschedulePlan, type ReschedulePlanSource } from '@/features/court-reservations/useReschedulePlan';
import { RescheduleOutcomeList } from '@/features/court-reservations/RescheduleOutcomeRows';
import { rescheduleFooterLabel, runIsShown, scheduleRunTitle } from '@/features/court-reservations/scheduleEditorModel';
import { CourtsCard } from '@/features/court-reservations/CourtsCard';
import { LocationTimeStepHeader } from '@/components/gameLocationTime/LocationTimeStepHeader';
import { useGameCourts } from '@/components/GameDetails/courts/gameCourtsContext';
import { ScheduleRunBody, ScheduleRunFooter } from '@/features/court-reservations/ScheduleRunPanel';
import type { ScheduleFocus } from '@/features/court-reservations/CourtsCard';
import { ReleaseBookingsSection, type ReleaseChoice } from './ReleaseBookingsSection';
import '@/features/court-reservations/courtReservations.css';

export type WhenWhereEditorOptions = {
  /** The dialog is open (state resets on open). */
  open: boolean;
  /** The tab is showing (the part that was tapped scrolls into view). */
  active: boolean;
  focus?: ScheduleFocus;
  /** Changes when the page asks for `focus` again while the dialog is open. */
  focusKey?: number;
  /** The dialog's scroll container. */
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Move the dialog to this tab (a stopped save, a run starting). */
  onActivate: () => void;
  /** Close the dialog (a finished run's "Close"). */
  onClose: () => void;
  game: Game;
  clubs: Club[];
  courts: Court[];
  /** Owners / admins: remove the club or the date and time. */
  canClear: boolean;
  onGameUpdate: (game: Game) => void;
  onCourtsChange?: (courts: Court[]) => void;
  onClubsChange?: (clubs: Club[]) => void;
};

/** How a save went: done (close), stopped (answer something first), running (club changes on screen), failed. */
export type WhenWhereSaveResult = 'saved' | 'stopped' | 'running' | 'failed';

export type WhenWhereEditor = {
  body: ReactNode;
  /** Its own confirmations (rendered next to the dialog). */
  dialogs: ReactNode;
  isDirty: boolean;
  isSaving: boolean;
  /** Save is meaningful now (dirty, or a ready reschedule plan). */
  canSave: boolean;
  /** The Save button's label on this tab ("Move game and 2 bookings" …). */
  saveLabel: string | null;
  save: () => Promise<WhenWhereSaveResult>;
  /** Club changes of a time move are on screen (the dialog shows `runFooter`, tabs locked). */
  showRun: boolean;
  runTitle: string | null;
  runFooter: ReactNode;
  /** A run is going: the dialog can't close. */
  locked: boolean;
};

function initialWhere(game: Game): WhereTabState {
  return { clubId: game.clubId || '', courtId: game.courtId || '' };
}

function initialWhen(game: Game) {
  const set = game.timeIsSet !== false && Boolean(game.startTime);
  const start = set ? new Date(game.startTime) : new Date();
  return {
    date: start,
    time: set ? start.toTimeString().slice(0, 5) : '',
    duration:
      set && game.endTime ? (new Date(game.endTime).getTime() - new Date(game.startTime).getTime()) / (1000 * 60 * 60) : 2,
  };
}

const EMPTY_WINDOW: IsoInterval = { start: new Date(0).toISOString(), end: new Date(90 * MINUTE_MS).toISOString() };

export function useWhenWhereEditor({
  open,
  active,
  focus,
  focusKey = 0,
  scrollRef,
  onActivate,
  onClose,
  game,
  clubs: clubsProp,
  courts,
  canClear,
  onGameUpdate,
  onCourtsChange,
  onClubsChange,
}: WhenWhereEditorOptions): WhenWhereEditor {
  const { t } = useTranslation();
  const gameCourts = useGameCourts();
  const planner = gameCourts.planner;
  const clubs = useStableIdentity(clubsProp);
  const user = useAuthStore((s) => s.user);
  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);

  const [where, setWhere] = useState<WhereTabState>(() => initialWhere(game));
  const [venueCityId, setVenueCityId] = useState(() => game.city?.id || game.club?.cityId || '');
  const when0 = useMemo(() => initialWhen(game), [game]);
  const [whenDate, setWhenDate] = useState<Date>(when0.date);
  const [whenTime, setWhenTime] = useState<string>(when0.time);
  const [whenDuration, setWhenDuration] = useState<number>(when0.duration);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [disableAutoAdjust, setDisableAutoAdjust] = useState(true);
  const [modalCourts, setModalCourts] = useState<Court[]>(courts);
  const [selectedCourtIds, setSelectedCourtIds] = useState<string[]>(() => initialCourtIds(game));
  /** Courts the organizer booked another way: the club's block on them is theirs. */
  const [ownBookingCourtIds, setOwnBookingCourtIds] = useState<string[]>(() => reportedCourtIdsOf(game));
  /** Their own club bookings chosen for linking on save, by court. */
  const [linkChoices, setLinkChoices] = useState<Record<string, OwnClubBooking>>({});
  const [timeCleared, setTimeCleared] = useState(false);
  const [releaseChoices, setReleaseChoices] = useState<Record<string, ReleaseChoice>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [softOverlap, setSoftOverlap] = useState<'soft' | 'reserved' | null>(null);
  const [claimPulse, setClaimPulse] = useState(0);
  const courtsRef = useRef(courts);
  courtsRef.current = courts;
  const clubsRef = useRef(clubs);
  clubsRef.current = clubs;
  const claimRef = useRef<HTMLDivElement>(null);
  const prevOpen = useRef(false);

  const {
    setSelectedDate: setHookDate,
    setSelectedTime: setHookTime,
    setDuration: setHookDuration,
    selectedDate: hookDate,
    selectedTime: hookTime,
    duration: hookDuration,
    generateTimeOptions,
    generateTimeOptionsForDate,
    canAccommodateDuration,
    getAdjustedStartTime,
    getTimeSlotsForDuration,
    isSlotHighlighted,
  } = useGameTimeDuration({ clubs, selectedClub: where.clubId, initialDate: when0.date, disableAutoAdjust });

  // Fresh state every time the sheet opens.
  useEffect(() => {
    if (open && !prevOpen.current) {
      const w = initialWhen(game);
      setWhere(initialWhere(game));
      setVenueCityId(game.city?.id || game.club?.cityId || '');
      setWhenDate(w.date);
      setWhenTime(w.time);
      setWhenDuration(w.duration);
      setHookDate(w.date);
      setHookTime(w.time);
      setHookDuration(w.duration);
      setDisableAutoAdjust(true);
      setModalCourts(game.clubId && courts.length > 0 && courts[0]?.clubId === game.clubId ? courts : []);
      setSelectedCourtIds(initialCourtIds(game));
      setOwnBookingCourtIds(reportedCourtIdsOf(game));
      setLinkChoices({});
      setTimeCleared(false);
      setReleaseChoices({});
      setSoftOverlap(null);
      window.setTimeout(() => setDisableAutoAdjust(false), 200);
    }
    prevOpen.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open
  }, [open]);

  useEffect(() => {
    if (!disableAutoAdjust) {
      setWhenDate(hookDate);
      setWhenTime(hookTime);
      setWhenDuration(hookDuration);
    }
  }, [disableAutoAdjust, hookDate, hookTime, hookDuration]);

  const scrollTo = useCallback(
    (part: ScheduleFocus) => {
      // The club is the first thing in the tab.
      if (part === 'club') {
        scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      const selector = part === 'courts' ? '[data-testid="edit-court-slots-picker"]' : '[data-testid="schedule-time-anchor"]';
      scrollRef.current?.querySelector(selector)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    },
    [scrollRef],
  );

  // Scroll to the tapped part once the tab is laid out.
  useEffect(() => {
    if (!open || !active || !focus || focus === 'club') return;
    const id = window.setTimeout(() => scrollTo(focus), 260);
    return () => window.clearTimeout(id);
  }, [open, active, focus, focusKey, scrollTo]);

  // The venue city's clubs (a club picked in another city).
  useEffect(() => {
    if (!open || !venueCityId) return;
    let cancelled = false;
    void clubsApi
      .getByCityId(venueCityId, game.entityType)
      .then((res) => {
        if (cancelled || !res.success) return;
        const next = res.data ?? [];
        if (identityKey(next) === identityKey(clubsRef.current)) return;
        onClubsChange?.(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [game.entityType, open, onClubsChange, venueCityId]);

  // The picked club's courts.
  useEffect(() => {
    if (!open) return;
    if (!where.clubId) {
      setModalCourts([]);
      return;
    }
    const ac = new AbortController();
    courtsApi
      .getByClubId(where.clubId, { sport: game.sport })
      .then((res) => {
        if (ac.signal.aborted) return;
        const nextKey = identityKey(res.data);
        setModalCourts((prev) => (identityKey(prev) === nextKey ? prev : res.data));
        if (nextKey !== identityKey(courtsRef.current)) onCourtsChange?.(res.data);
      })
      .catch((err) => {
        if (err?.name === 'AbortError' || ac.signal.aborted) return;
        setModalCourts([]);
      });
    return () => ac.abort();
  }, [open, where.clubId, game.sport, onCourtsChange]);

  useEffect(() => {
    if (!open || modalCourts.length === 0) return;
    setSelectedCourtIds((prev) => {
      const filtered = prev.filter((id) => {
        const court = modalCourts.find((c) => c.id === id);
        return !court || courtMatchesSportFilter(court, game.sport);
      });
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [open, modalCourts, game.sport]);

  /* ---------------- derived ---------------- */

  const selectedClub = clubs.find((c) => c.id === where.clubId);
  const slotModel = supportsClubBookingFlow(game.entityType, 'edit') && Boolean(where.clubId);
  const clubChanged = where.clubId !== (game.clubId || '');
  const clubCleared = clubChanged && !where.clubId;
  const links = useMemo(() => planner?.links ?? [], [planner?.links]);
  const hasLinks = (game.linkedBookings ?? []).length > 0;
  const lockedCourtIds = useMemo(() => (clubChanged ? new Set<string>() : linkedCourtIds(game)), [clubChanged, game]);
  const courtNeed = Math.max(
    defaultCourtSlotCount({ maxParticipants: game.maxParticipants, playersPerMatch: playersPerMatchOf(game) }),
    lockedCourtIds.size,
  );
  const initialCourtKey = useMemo(() => initialCourtIds(game).join(','), [game]);
  const initialReportedKey = useMemo(() => [...reportedCourtIdsOf(game)].sort().join(','), [game]);
  const ownBookingSet = useMemo(
    () => new Set(ownBookingCourtIds.filter((id) => selectedCourtIds.includes(id))),
    [ownBookingCourtIds, selectedCourtIds],
  );
  const linkSet = useMemo(
    () => new Set(Object.keys(linkChoices).filter((id) => selectedCourtIds.includes(id))),
    [linkChoices, selectedCourtIds],
  );

  const editedWindow = useMemo(() => {
    if (timeCleared || !whenTime || !whenDuration) return null;
    const start = createDateFromClubTime(whenDate, whenTime, selectedClubData(selectedClub, game));
    return { startTime: start.toISOString(), endTime: addHours(start, whenDuration).toISOString() };
  }, [timeCleared, whenDate, whenTime, whenDuration, selectedClub, game]);
  const windowMoved = editedWindow != null && timeChanged(game, editedWindow);

  const releaseMode = hasLinks && (clubCleared || timeCleared);
  /** A game with bookings (or several courts) moving in time: the planner says what happens to each court. */
  const plannerMode =
    planner != null && !clubChanged && !timeCleared && windowMoved && gameWindow(game) != null && rescheduleNeeded(game);

  const timeZone = getClubTimezone(game) ?? selectedClub?.city?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const crText = useCourtReservationText(timeZone);
  const clubClock = useMemo(
    () => createClubTimeFormatter({ timeZone, locale: displaySettings.locale, hour12: displaySettings.hour12 }),
    [timeZone, displaySettings.locale, displaySettings.hour12],
  );

  /* ---------------- planner (games with bookings) ---------------- */

  const currentWindow = gameWindow(game) ?? EMPTY_WINDOW;
  const planSource = useMemo<ReschedulePlanSource>(
    () => ({
      gameId: game.id,
      currentWindow,
      slots: planner?.slots ?? [],
      occupancy: planner?.occupancy,
      sharedWith: planner?.sharedWith,
      alternativeCourts: (planner?.clubCourts ?? []).map((c) => ({ courtId: c.id, name: c.name })),
      providerCapabilities: planner?.providerCapabilities,
    }),
    [game.id, currentWindow, planner?.slots, planner?.occupancy, planner?.sharedWith, planner?.clubCourts, planner?.providerCapabilities],
  );
  const planBounds = useMemo(() => {
    const times = [currentWindow.start, currentWindow.end, editedWindow?.startTime, editedWindow?.endTime]
      .map((v) => (v ? parseInstantMs(v) : null))
      .filter((v): v is number => v != null);
    if (times.length === 0) return null;
    const pad = 3 * 60 * MINUTE_MS;
    return { startMs: Math.min(...times) - pad, endMs: Math.max(...times) + pad };
  }, [currentWindow.start, currentWindow.end, editedWindow?.startTime, editedWindow?.endTime]);
  const plan = useReschedulePlan(planSource, planBounds);
  const { setDraft } = plan;
  useEffect(() => {
    if (!plannerMode || !editedWindow) return;
    setDraft({ startMs: Date.parse(editedWindow.startTime), endMs: Date.parse(editedWindow.endTime) });
  }, [plannerMode, editedWindow, setDraft]);
  const plannerReady = plannerMode && plan.effective.footer.kind === 'ready';
  const plannerBlocked = plannerMode && plan.effective.footer.kind === 'blocked';

  const run = planner?.run ?? null;
  const showRun = open && runIsShown(run);

  /* ---------------- busy courts at the club ---------------- */

  const claimChecksOn = open && slotModel && !plannerMode && !showRun && editedWindow != null;
  const dayKey = whenDate.toDateString();
  const dayBookingsQuery = useQuery({
    queryKey: ['scheduleClubDayBookings', where.clubId, dayKey],
    queryFn: () => fetchBookedCourtsForDay({ clubId: where.clubId, selectedDate: whenDate, club: selectedClub }),
    enabled: claimChecksOn && Boolean(where.clubId),
    staleTime: 30_000,
  });
  const windowMs = useMemo(
    () => (editedWindow ? { startMs: Date.parse(editedWindow.startTime), endMs: Date.parse(editedWindow.endTime) } : null),
    [editedWindow],
  );
  const clubConflicts = useMemo(() => {
    if (!claimChecksOn || !windowMs || !dayBookingsQuery.data) return [];
    return findClubBookingConflicts(dayBookingsQuery.data, selectedCourtIds, windowMs);
  }, [claimChecksOn, windowMs, dayBookingsQuery.data, selectedCourtIds]);
  const freeCourts = useMemo(() => {
    if (!claimChecksOn || !windowMs || !dayBookingsQuery.data) return [];
    const others = modalCourts.filter((c) => !selectedCourtIds.includes(c.id) && courtMatchesSportFilter(c, game.sport));
    const taken = new Set(findClubBookingConflicts(dayBookingsQuery.data, others.map((c) => c.id), windowMs).map((c) => c.courtId));
    return others.filter((c) => !taken.has(c.id)).map((c) => ({ id: c.id, name: c.name }));
  }, [claimChecksOn, windowMs, dayBookingsQuery.data, modalCourts, selectedCourtIds, game.sport]);
  const ownClubBookings = useOwnClubBookings({
    game,
    club: selectedClub,
    courts: modalCourts,
    selectedDate: whenDate,
    enabled: claimChecksOn && !clubChanged && clubConflicts.length > 0,
  });
  const verdictOf = useCallback(
    (conflict: ClubBookingConflict) =>
      windowMs ? verifyClubBookingConflict(conflict, windowMs, ownClubBookings) : ({ kind: 'unknown' } as const),
    [windowMs, ownClubBookings],
  );
  const initiallyReported = useMemo(() => new Set(initialReportedKey ? initialReportedKey.split(',') : []), [initialReportedKey]);
  const openConflicts = clubConflicts.filter((c) => !ownBookingSet.has(c.courtId) && !linkSet.has(c.courtId));
  const linkedConflicts = clubConflicts.filter((c) => linkSet.has(c.courtId) && linkChoices[c.courtId]);
  const claimedConflicts = clubConflicts.filter(
    (c) => ownBookingSet.has(c.courtId) && (clubChanged || !initiallyReported.has(c.courtId)),
  );
  const providerName = providerDisplayName(selectedClub?.integrationType ?? null);
  const courtNameOf = useCallback(
    (courtId: string) =>
      modalCourts.find((c) => c.id === courtId)?.name ??
      courts.find((c) => c.id === courtId)?.name ??
      game.gameCourts?.find((gc) => gc.courtId === courtId)?.court?.name ??
      (game.court?.id === courtId ? game.court.name : undefined) ??
      '',
    [modalCourts, courts, game.gameCourts, game.court],
  );

  /* ---------------- court picking ---------------- */

  const toggleCourt = useCallback(
    (id: string) => {
      if (!slotModel) {
        const next = id === 'notBooked' ? [] : [id];
        setSelectedCourtIds(next);
        setWhere((s) => ({ ...s, courtId: next[0] ?? '' }));
        return;
      }
      if (lockedCourtIds.has(id)) return;
      setSelectedCourtIds((prev) => {
        let next: string[];
        if (prev.includes(id)) next = prev.filter((courtId) => courtId !== id);
        else if (prev.length >= courtNeed) {
          // Full: the new court replaces the last one that can move (one court → a plain switch).
          const swap = [...prev].reverse().find((courtId) => !lockedCourtIds.has(courtId));
          if (!swap) return prev;
          next = prev.map((courtId) => (courtId === swap ? id : courtId));
        } else next = [...prev, id];
        setWhere((s) => ({ ...s, courtId: next[0] ?? '' }));
        return next;
      });
    },
    [slotModel, lockedCourtIds, courtNeed],
  );
  const swapCourt = useCallback((fromId: string, toId: string) => {
    setSelectedCourtIds((prev) => {
      const next = prev.map((id) => (id === fromId ? toId : id));
      setWhere((s) => ({ ...s, courtId: next[0] ?? '' }));
      return next;
    });
  }, []);
  const setCourtIds = useCallback((ids: string[]) => {
    setSelectedCourtIds(ids);
    setWhere((s) => ({ ...s, courtId: ids[0] ?? '' }));
  }, []);

  /* ---------------- dirty / close ---------------- */

  const claimsDirty = slotModel && [...ownBookingSet].sort().join(',') !== (clubChanged ? '' : initialReportedKey);
  const timeDirty =
    timeCleared ||
    whenTime !== when0.time ||
    whenDuration !== when0.duration ||
    (when0.time !== '' && whenDate.toDateString() !== when0.date.toDateString());
  // An older game holding more court slots than its roster needs: saving trims them to the need.
  const countDirty = slotModel && !clubChanged && currentCourtSlotCount(game) !== Math.max(courtNeed, selectedCourtIds.length);
  const isDirty =
    clubChanged ||
    claimsDirty ||
    linkSet.size > 0 ||
    selectedCourtIds.join(',') !== initialCourtKey ||
    timeDirty ||
    countDirty;



  /* ---------------- save ---------------- */

  const refreshGame = async () => {
    const response = await gamesApi.getById(game.id);
    onGameUpdate(response.data);
  };

  const showSaveError = (err: unknown) => {
    const clash = courtClashDetails(err);
    if (clash) {
      const message = describeCourtClash(clash, courtNameOf, clubClock.time);
      toast.error(t(message.key, message.params));
      return;
    }
    const data = (err as { response?: { data?: { message?: string } } }).response?.data;
    const msg = data?.message || 'errors.generic';
    toast.error(t(msg, { defaultValue: msg }));
  };

  /** Busy courts nobody answered for, other app games: stop and say so (no pop-up for the club case). */
  const gate = async (): Promise<boolean> => {
    if (openConflicts.length > 0) {
      setClaimPulse((n) => n + 1);
      claimRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      toast(t('gameDetails.courts.clubBusyChooseFirst'));
      return false;
    }
    const unchanged = !windowMoved && !clubChanged && selectedCourtIds.join(',') === initialCourtKey;
    if (!where.clubId || !editedWindow || selectedCourtIds.length === 0 || unchanged) {
      return true;
    }
    try {
      const courtIds = new Set(selectedCourtIds);
      const bookings = (await fetchBookedCourtsForDay({ clubId: where.clubId, selectedDate: whenDate, club: selectedClub })).filter(
        (b) => b.courtId != null && courtIds.has(b.courtId),
      );
      const overlap = checkBookingOverlap(
        bookings.filter((b) => !(b.courtId && (ownBookingSet.has(b.courtId) || linkSet.has(b.courtId)) && b.clubBooked && !b.holdBlocked)),
        whenTime,
        whenDuration,
        selectedClub,
        { excludeGameId: game.id },
      );
      if (overlap.reservedGameCount > 0 || overlap.hasSoftOverlap) {
        setSoftOverlap(overlap.reservedGameCount > 0 ? 'reserved' : 'soft');
        return false;
      }
    } catch {
      /* proceed: the server's clash guard still answers */
    }
    return true;
  };

  const executeSave = async (): Promise<WhenWhereSaveResult> => {
    setIsSaving(true);
    try {
      if (releaseMode && planner) {
        await planner.releaseLinks(
          links.map(({ link, canCancel }) => ({ link, cancel: canCancel && releaseChoices[link.externalBookingId] === 'cancel' })),
        );
      }
      if (plannerMode && planner) {
        // The runner saves the time and does the club changes; the tab shows the checklist.
        planner.start(plan.effective, currentWindow, plan.newWindow);
        onActivate();
        return 'running';
      }
      const ownLinks = [...linkSet]
        .map((courtId) => linkChoices[courtId])
        .filter((b, i, all) => b && all.findIndex((x) => x.externalBookingId === b.externalBookingId) === i);
      const linkedCourts = new Set(ownLinks.map((b) => b.courtId));
      // Link their own bookings before the time moves: the clash guard then sees them as this game's.
      for (const booking of ownLinks) await courtSlotsApi.linkBooking(game.id, booking.body);
      const reportedCourtIds = new Set([...ownBookingSet].filter((id) => !linkedCourts.has(id)));
      await saveEditLocationTime(
        game.id,
        buildEditLocationTimeRequests({
          game,
          clubId: where.clubId,
          courtIds: slotModel ? selectedCourtIds : selectedCourtIds.slice(0, 1),
          slotModel,
          courtSlotCount: slotModel ? Math.max(courtNeed, selectedCourtIds.length) : null,
          time: editedWindow,
          clearTime: timeCleared,
          courtBookingMode: game.courtBookingMode === 'GAME_ONLY' && slotModel ? 'CLUB' : undefined,
          reportedCourtIds: slotModel ? reportedCourtIds : undefined,
        }),
      );
      await refreshGame();
      return 'saved';
    } catch (err) {
      showSaveError(err);
      void refreshGame().catch(() => undefined);
      return 'failed';
    } finally {
      setIsSaving(false);
    }
  };

  const save = async (): Promise<WhenWhereSaveResult> => {
    if (isSaving) return 'failed';
    setIsSaving(true);
    const ok = await gate().catch(() => true);
    setIsSaving(false);
    if (!ok) {
      onActivate();
      return 'stopped';
    }
    return executeSave();
  };

  /* ---------------- render ---------------- */

  const weatherTiming =
    selectedClub?.cityId && editedWindow
      ? { cityId: selectedClub.cityId, startTime: editedWindow.startTime, endTime: editedWindow.endTime }
      : null;
  const showPolicies =
    game.entityType !== 'BAR' &&
    Boolean(selectedClub) &&
    Boolean(selectedClub?.policyText?.trim() || selectedClub?.cancellationNoticeHours);
  const runTitle = showRun && run ? scheduleRunTitle(run, crText) : null;
  const saveLabel = plannerMode ? rescheduleFooterLabel(plan.effective, crText) : null;
  const canSave = !isSaving && (plannerMode ? plannerReady : isDirty);

  const linkTimes = useMemo(() => {
    const out: Record<string, { start?: string | null; end?: string | null; courtId?: string | null }> = {};
    for (const { link } of links) out[link.externalBookingId] = { start: link.bookingStart, end: link.bookingEnd, courtId: link.courtId };
    return out;
  }, [links]);

  /*
   * The courts' bookings. Live while the draft is the saved game (club, time
   * and courts unchanged): the same rows as on the game page, a tap opens the
   * court sheet over the dialog. Otherwise what the change does to them.
   */
  const scheduleUnchanged = !clubChanged && !timeDirty && selectedCourtIds.join(',') === initialCourtKey;
  const liveCard = gameCourts.card && gameCourts.card.hasClub && scheduleUnchanged && !countDirty ? gameCourts.card : null;
  const bookingsBody = releaseMode ? (
    <ReleaseBookingsSection
      links={links}
      courtName={courtNameOf}
      formatRange={clubClock.range}
      clubName={selectedClub?.name ?? game.club?.name ?? ''}
      reason={clubCleared ? 'club' : 'time'}
      choices={releaseChoices}
      onChange={(id, choice) => setReleaseChoices((prev) => ({ ...prev, [id]: choice }))}
    />
  ) : plannerMode && planner ? (
    <RescheduleOutcomeList
      planner={plan}
      slots={planner.slots}
      courtsById={planner.courtsById}
      sharedWith={planner.sharedWith}
      providerCapabilities={planner.providerCapabilities}
      playerCount={planner.playerCount}
      text={crText}
    />
  ) : liveCard ? (
    <CourtsCard
      {...liveCard}
      embedded
      showAction={openConflicts.length === 0}
      onChange={(part) => scrollTo(part ?? 'club')}
    />
  ) : slotModel && editedWindow && isDirty ? (
    <p className="text-sm text-gray-600 dark:text-gray-300" data-testid="schedule-book-after-save">
      {t('gameDetails.whenWhere.bookAfterSave')}
    </p>
  ) : null;
  const bookingsSection = bookingsBody ? (
    <section className="space-y-2" data-testid="schedule-bookings">
      <LocationTimeStepHeader icon={CalendarCheck} title={t('gameDetails.whenWhere.bookings')} />
      {bookingsBody}
    </section>
  ) : null;

  const body =
    showRun && run && planner ? (
      <ScheduleRunBody
        run={run}
        courtsById={planner.courtsById}
        text={crText}
        linkTimes={linkTimes}
        playerCount={planner.playerCount}
        currentUserId={user?.id ?? null}
        canResumeOther={Boolean(planner.resumeOther)}
        onRetry={planner.retry}
        busy={planner.busy}
      />
    ) : (
      <div className="space-y-4" data-testid="game-schedule-sheet">
        <LocationTimeTab
                  game={game}
                  entityType={game.entityType}
                  clubs={clubs}
                  courts={modalCourts}
                  selectedClub={where.clubId}
                  selectedCourtIds={selectedCourtIds}
                  onSelectClub={(id, club) => {
                    if (club) {
                      onClubsChange?.(clubs.some((c) => c.id === club.id) ? clubs.map((c) => (c.id === club.id ? club : c)) : [...clubs, club]);
                    }
                    if (club?.cityId) setVenueCityId(club.cityId);
                    setWhere({ clubId: id, courtId: '' });
                    setSelectedCourtIds([]);
                    setOwnBookingCourtIds([]);
                    setLinkChoices({});
                  }}
                  onVenueCityChange={(id) => {
                    if (id === venueCityId) return;
                    setVenueCityId(id);
                    setWhere({ clubId: '', courtId: '' });
                    setSelectedCourtIds([]);
                  }}
                  venueCityId={venueCityId}
                  slotModel={slotModel}
                  onToggleCourt={toggleCourt}
                  onSetCourtIds={setCourtIds}
                  lockedCourtIds={lockedCourtIds}
                  courtNeed={courtNeed}
                  clubLocked={hasLinks}
                  courtsLocked={plannerMode}
                  ownClubBookingCourtIds={[...ownBookingSet]}
                  onClearClub={
                    canClear
                      ? () => {
                          setWhere({ clubId: '', courtId: '' });
                          setSelectedCourtIds([]);
                          setOwnBookingCourtIds([]);
                          setLinkChoices({});
                        }
                      : null
                  }
                  onClearTime={canClear && game.timeIsSet !== false ? () => setTimeCleared(true) : null}
                  timeCleared={timeCleared}
                  onUndoClearTime={() => setTimeCleared(false)}
                  claimSection={
                    openConflicts.length > 0 || claimedConflicts.length > 0 || linkedConflicts.length > 0 ? (
                      <div ref={claimRef} key={claimPulse} className={claimPulse > 0 ? 'cr-attention' : undefined}>
                        <ClubBookingClaimCard
                          open={openConflicts}
                          claimed={claimedConflicts}
                          linked={linkedConflicts.map((conflict) => ({ conflict, booking: linkChoices[conflict.courtId] }))}
                          courtName={courtNameOf}
                          formatTime={clubClock.time}
                          verdictOf={verdictOf}
                          providerName={providerName}
                          freeCourts={freeCourts}
                          onSwap={swapCourt}
                          onClaim={(courtId) => setOwnBookingCourtIds((prev) => [...new Set([...prev, courtId])])}
                          onUndo={(courtId) => setOwnBookingCourtIds((prev) => prev.filter((id) => id !== courtId))}
                          onUseOwn={(courtId, booking) => setLinkChoices((prev) => ({ ...prev, [courtId]: booking }))}
                          onUndoOwn={(courtId) =>
                            setLinkChoices((prev) => {
                              const next = { ...prev };
                              delete next[courtId];
                              return next;
                            })
                          }
                        />
                      </div>
                    ) : null
                  }
                  bookingsSection={bookingsSection}
                  selectedDate={whenDate}
                  selectedTime={whenTime}
                  duration={whenDuration}
                  showDatePicker={showDatePicker}
                  onDateChange={(d) => {
                    setWhenDate(d);
                    setHookDate(d);
                  }}
                  onTimeChange={(v) => {
                    setWhenTime(v);
                    setHookTime(v);
                  }}
                  onDurationChange={(d) => {
                    setWhenDuration(d);
                    setHookDuration(d);
                  }}
                  onShowDatePickerChange={setShowDatePicker}
                  generateTimeOptions={generateTimeOptions}
                  generateTimeOptionsForDate={generateTimeOptionsForDate}
                  canAccommodateDuration={canAccommodateDuration}
                  getAdjustedStartTime={getAdjustedStartTime}
                  getTimeSlotsForDuration={getTimeSlotsForDuration}
                  isSlotHighlighted={isSlotHighlighted}
                  dateInputRef={{ current: null }}
                />
                {plannerBlocked ? (
                  <p className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
                    <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
                    {crText.t('move.footer.blocked')}
                  </p>
                ) : null}
                {showPolicies && selectedClub ? <ClubPoliciesBlock club={selectedClub} entityType={game.entityType} /> : null}
                {weatherTiming ? (
                  <WeatherPreviewCard
                    cityId={weatherTiming.cityId}
                    startTime={weatherTiming.startTime}
                    endTime={weatherTiming.endTime}
                    enabled={game.entityType !== 'BAR'}
                    locale={displaySettings.locale}
                    hour12={displaySettings.hour12}
                  />
                ) : null}
      </div>
    );

  const runFooter =
    showRun && run && planner ? (
      <ScheduleRunFooter
        run={run}
        text={crText}
        busy={planner.busy}
        currentUserId={user?.id ?? null}
        onRetry={planner.retry}
        onDismiss={planner.dismissRun}
        onClose={onClose}
        onResumeOther={planner.resumeOther}
      />
    ) : null;

  const dialogs = (
    <ConfirmationModal
      isOpen={softOverlap != null}
      tone="warning"
      title={t('createGame.overlapSoftTitle')}
      message={t(softOverlap === 'reserved' ? 'gameDetails.courts.overlapReserved' : 'createGame.overlapSoftMessage')}
      confirmText={t('createGame.overlapSoftProceed')}
      cancelText={t('common.cancel')}
      onConfirm={() => {
        setSoftOverlap(null);
        void executeSave().then((result) => {
          if (result === 'saved') onClose();
        });
      }}
      onClose={() => setSoftOverlap(null)}
    />
  );

  return {
    body,
    dialogs,
    isDirty,
    isSaving,
    canSave,
    saveLabel,
    save,
    showRun,
    runTitle,
    runFooter,
    locked: run?.phase === 'running',
  };
}

/** The club whose clock the picked wall time is in (the game's club when none is picked yet). */
function selectedClubData(club: Club | undefined, game: Game): Club | undefined {
  return club ?? (game.club as Club | undefined);
}
