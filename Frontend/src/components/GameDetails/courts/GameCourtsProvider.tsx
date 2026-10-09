/**
 * A game's courts and their bookings — one source for the game page
 * (docs/domains/booking.md "Game page"). There is no separate Courts card:
 *  - Game info shows the courts inside its "where" row (`useGameCourts().card`,
 *    rendered as an embedded `CourtsCard`): one row per court in one of three
 *    states — Booked · <provider>, Booked by organizer, Not booked ("No
 *    time yet" without a time) — notices, and one main button;
 *  - the Edit dialog's "When and where" tab gets the same rows (live, while
 *    its draft matches the saved game), the reschedule planner and its
 *    runner (`useGameCourts().planner`).
 * Organizers tap a row for the court sheet (`CourtSlotSheet`: use my booking
 * found at the club, book now, use a booking I already made, I booked it
 * another way, link the real booking, not booked after all, remove from game,
 * cancel at the club, check again). Everything that edits the club, time or
 * courts goes to the "When and where" tab (`onEdit`). The sheets live here
 * and stack over the Edit dialog when opened from it.
 *
 * Removing a booking from the game and cancelling it at the club both ask
 * first. Every write goes through `@/api/courtSlots` (`?timePolicy=explicit`);
 * its response is applied to the game at once (`applyCourtSlotsWrite`) and
 * the full game is re-fetched in the background. Domain: docs/domains/booking.md
 * (Court slots, Clash guard, Club-side drift, Reschedule journal).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { Club, Court, Game } from '@/types';
import { defaultCourtSlotCount, type CourtSlotView } from '@shared/gameBooking/courtReservations';
import { playersPerMatchOf } from '@shared/matchFormat';
import { parseInstantMs } from '@shared/gameBooking/coverageIntervals';
import { clubHasBookingIntegration } from '@shared/clubIntegration';
import { planGapFill, type GapFillResult } from '@shared/gameBooking/planReschedule';
import type { ProviderCapabilityOverrides } from '@shared/gameBooking/providerCapabilities';
import type { LinkBookingToGameBody } from '@shared/gameBooking/contracts';
import { booktimeIsoToUtcIso } from '@shared/booktime/localTime';
import { gamesApi } from '@/api/games';
import { courtSlotsApi } from '@/api/courtSlots';
import { queryClient } from '@/queries/queryClient';
import { queryKeys } from '@/queries/queryKeys';
import { useAuthStore } from '@/store/authStore';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { useOwnClubBookings } from '@/components/GameDetails/editGameInfo/useOwnClubBookings';
import type { OwnClubBooking } from '@/components/GameDetails/editGameInfo/clubBookingClaims';
import { providerDisplayName } from '@shared/gameBooking/reservationCopy';
import type { SchedulePlanner } from '@/components/GameDetails/schedule/schedulePlanner';
import { createHydratedClubBookingProvider } from '@/integrations/booking/createClubBookingProvider';
import { useGameLinkedBookingViewer } from '@/hooks/useGameLinkedBookingViewer';
import { buildCourtReservationsInput } from '@/utils/courtReservationView';
import { getClubTimezone } from '@/utils/gameTimeDisplay';
import {
  CourtSlotSheet,
  applyCourtSlotsWrite,
  mergeAcceptUpstreamIntoGame,
  mergeLinkedBookingsIntoGame,
  buildCourtSlotsBody,
  ReservationDriftBanner,
  UnfinishedChangesBanner,
  clubFollowUpsFromPayload,
  clubFollowUpsFromRun,
  collectReservationDrifts,
  createReservationExecutors,
  createServerJournalLoader,
  createServerRunJournal,
  defaultReservationExecutorDeps,
  deriveGameCourtReservations,
  mergeClubFollowUps,
  providerCanCancel,
  useCourtSlotsMutations,
  useClubTime,
  useReservationChangeRunner,
  type CourtRef,
  type CourtSlotSheetAction,
  type AcceptUpstreamResult,
  type CourtSlotsMutationOutcome,
  type CourtSlotsWriteResult,
  type CourtsCardAction,
  type DriftActionKind,
  type ScheduleFocus,
  type ReservationDrift,
} from '@/features/court-reservations';
import type { LinkedBookingPayload } from '@/features/court-reservations/courtReservationsInput';
import { reportedAnyCourtCountOf } from '@/features/court-reservations/courtReservationsModel';
import type { EffectiveReschedulePlan } from '@/features/court-reservations/rescheduleChoices';
import type { IsoInterval } from '@shared/gameBooking/coverageIntervals';
import {
  buildCourtsById,
  clubCanBookHere,
  courtClashDetails,
  describeCourtClash,
  freeCourtsForWindow,
  gapExtraLines,
  gapFillEntries,
  gapFillUnavailableMessage,
  gameShowsCourtsSection,
  gameWindow,
  planSlotReservations,
  providerCanVerify,
  resolveGameClub,
  findOwnBookingElsewhere,
  timeChangeNoticeCount,
  type ReserveEntry,
} from './gameCourtsModel';
import { EMPTY_GAME_COURTS as EMPTY, GameCourtsContext, type GameCourtsValue } from './gameCourtsContext';
import { gameCourtsQueryKeys, useGameCourtOccupancy, useGameSharedWith } from './useGameCourtsData';
import { GameCourtReserveFlow } from './GameCourtReserveFlow';
import { GameCourtLinkSheet } from './GameCourtLinkSheet';

export type GameCourtsProviderProps = {
  game: Game;
  /** The club's courts (shell list, sport-filtered). */
  courts: Court[];
  clubs: Club[];
  /** Owner/admin while the game is still open. */
  canEdit: boolean;
  onGameUpdate: (game: Game) => void;
  /** Open the Edit dialog on "When and where" (organizers). */
  onEdit?: (focus?: ScheduleFocus) => void;
  /** The Edit dialog is open (sheets opened from it stack over it). */
  editorOpen?: boolean;
  children?: ReactNode;
};

/** Courts the roster needs (players ÷ players per court), at least one. */
function courtNeedOf(game: Game): number {
  return defaultCourtSlotCount({ maxParticipants: game.maxParticipants, playersPerMatch: playersPerMatchOf(game) });
}

function courtRefs(courts: readonly Court[]): CourtRef[] {
  return courts.map((c) => ({ id: c.id, name: c.name, externalCourtId: c.externalCourtId ?? null, isIndoor: c.isIndoor }));
}

export function GameCourtsProvider(props: GameCourtsProviderProps) {
  const { game, clubs, courts, canEdit, children } = props;
  const club = useMemo(() => resolveGameClub(game, clubs, courts), [game, clubs, courts]);
  if (!gameShowsCourtsSection(game) || (!club && !canEdit)) {
    return <GameCourtsContext.Provider value={EMPTY}>{children}</GameCourtsContext.Provider>;
  }
  if (canEdit && club) return <OrganizerCourts {...props} club={club} />;
  if (canEdit) return <OrganizerNoClub {...props} />;
  return <ReadOnlyCourts game={game} club={club}>{children}</ReadOnlyCourts>;
}

function OrganizerNoClub({ game, onEdit, children }: GameCourtsProviderProps) {
  const reservations = useMemo(() => deriveGameCourtReservations(game), [game]);
  const timeZone = getClubTimezone(game) ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const value = useMemo<GameCourtsValue>(
    () => ({
      card: {
        reservations,
        window: gameWindow(game),
        courtsById: {},
        timeZone,
        courtNeed: courtNeedOf(game),
        playerCount: game.maxParticipants,
        hasClub: false,
        canEdit: true,
        onChange: (focus) => onEdit?.(focus ?? 'club'),
      },
      planner: null,
      openSlot: null,
    }),
    [reservations, game, timeZone, onEdit],
  );
  return <GameCourtsContext.Provider value={value}>{children}</GameCourtsContext.Provider>;
}

function ReadOnlyCourts({ game, club, children }: { game: Game; club: Club | undefined; children?: ReactNode }) {
  const reservations = useMemo(() => deriveGameCourtReservations(game), [game]);
  const courtsById = useMemo(() => buildCourtsById(club, game), [club, game]);
  const value = useMemo<GameCourtsValue>(
    () => ({
      card: {
        reservations,
        window: gameWindow(game),
        courtsById,
        timeZone: getClubTimezone(game) ?? club?.city?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        courtNeed: courtNeedOf(game),
        playerCount: game.maxParticipants,
        clubName: club?.name ?? null,
        hasClub: Boolean(club),
        canEdit: false,
      },
      planner: null,
      openSlot: null,
    }),
    [reservations, game, courtsById, club],
  );
  return <GameCourtsContext.Provider value={value}>{children}</GameCourtsContext.Provider>;
}

type ReserveRequest = { entries: ReserveEntry[]; replace?: string[] };

function OrganizerCourts({
  game,
  courts,
  club,
  onGameUpdate,
  onEdit,
  editorOpen = false,
  children,
}: GameCourtsProviderProps & { club: Club }) {
  const { t } = useTranslation();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const timeZone = getClubTimezone(game) ?? club.city?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const window = useMemo(() => gameWindow(game), [game]);
  const input = useMemo(() => buildCourtReservationsInput(game), [game]);
  const reservations = useMemo(() => deriveGameCourtReservations(game), [game]);
  const courtsById = useMemo(() => buildCourtsById(club, game), [club, game]);
  const clubCourts = useMemo(() => courtRefs(courts.length > 0 ? courts : club.courts ?? []), [courts, club.courts]);
  const canBookHere = clubCanBookHere(game, club);
  const links = useMemo(() => (game.linkedBookings ?? []) as LinkedBookingPayload[], [game.linkedBookings]);

  const [openSlotKey, setOpenSlotKey] = useState<string | null>(null);
  const [linkSlot, setLinkSlot] = useState<CourtSlotView | null>(null);
  const [reserve, setReserve] = useState<ReserveRequest | null>(null);
  const [gapConfirm, setGapConfirm] = useState<{ entries: ReserveEntry[]; result: GapFillResult } | null>(null);
  /** About to book while the organizer already holds another court at this time (not linked here). */
  const [ownElsewhere, setOwnElsewhere] = useState<{
    targets: CourtSlotView[];
    opts: { pickedCourtId?: string | null };
    booking: OwnClubBooking;
  } | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [cancelLink, setCancelLink] = useState<LinkedBookingPayload | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState<{ slot: CourtSlotView; link: LinkedBookingPayload } | null>(null);
  const [localPending, setLocalPending] = useState<'verify' | 'cancel_at_club' | null>(null);
  const [pendingDrift, setPendingDrift] = useState<string | null>(null);
  const [dismissedFollowUps, setDismissedFollowUps] = useState<ReadonlySet<string>>(() => new Set());
  const [sheetError, setSheetError] = useState<string | null>(null);

  const openSlot = reservations.slots.find((s) => s.key === openSlotKey) ?? null;
  const occupancy = useGameCourtOccupancy(game.id, club.id, window, true);
  const sharedWith = useGameSharedWith(game, links.length > 0);
  const viewer = useGameLinkedBookingViewer(game, links.length > 0);

  // Latest game for merging write responses (a write can land after a re-render).
  const gameRef = useRef(game);
  gameRef.current = game;

  const refresh = useCallback(async () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.games.detail(game.id) });
    void queryClient.invalidateQueries({ queryKey: gameCourtsQueryKeys.occupancy(game.id) });
    void queryClient.invalidateQueries({ queryKey: gameCourtsQueryKeys.sharedWith(game.id) });
    try {
      const response = await gamesApi.getById(game.id);
      onGameUpdate(response.data);
    } catch {
      /* the next socket update / pull-to-refresh catches up */
    }
  }, [game.id, onGameUpdate]);

  /** Show a write's result on the card now; the background refresh fills in the rest. */
  const applyGame = useCallback(
    (next: Game | null) => {
      if (next) {
        gameRef.current = next;
        onGameUpdate(next);
      }
      void refresh();
    },
    [onGameUpdate, refresh],
  );
  const applyWrite = useCallback(
    (result: CourtSlotsWriteResult) => applyGame(applyCourtSlotsWrite(gameRef.current, result)),
    [applyGame],
  );

  const clock = useClubTime(timeZone);
  const errorMessage = useCallback(
    (error: unknown): string => {
      const clash = courtClashDetails(error);
      if (clash) {
        const message = describeCourtClash(clash, (id) => courtsById[id]?.name, clock.time);
        return t(message.key, message.params);
      }
      return t('gameDetails.courts.updateFailed');
    },
    [courtsById, t, clock],
  );
  const showError = useCallback((error: unknown) => void toast.error(errorMessage(error)), [errorMessage]);

  const openSchedule = useCallback(
    (focus?: ScheduleFocus) => {
      setOpenSlotKey(null);
      setLinkSlot(null);
      onEdit?.(focus);
    },
    [onEdit],
  );

  /* ---------------- the organizer's own club bookings ---------------- */

  // A court the club shows busy may be the organizer's own booking: check their club account.
  const gameDate = useMemo(() => new Date(game.startTime), [game.startTime]);
  const anyOpen = reservations.slots.some((s) => s.state !== 'linked');
  const ownClubBookings = useOwnClubBookings({
    game,
    club,
    courts,
    selectedDate: gameDate,
    enabled: window != null && anyOpen && clubHasBookingIntegration(club),
  });
  /** Per not-yet-linked slot: an own booking on its court overlapping the game (each booking used once). */
  const ownBySlot = useMemo(() => {
    const out: Record<string, OwnClubBooking> = {};
    if (!ownClubBookings || !window) return out;
    const ws = parseInstantMs(window.start) ?? 0;
    const we = parseInstantMs(window.end) ?? 0;
    const used = new Set<string>();
    const overlaps = (b: OwnClubBooking) => Date.parse(b.start) < we && Date.parse(b.end) > ws;
    const open = reservations.slots.filter((s) => s.state !== 'linked');
    // Courts first, then "Any court" slots take what is left.
    for (const slot of [...open.filter((s) => s.effectiveCourtId), ...open.filter((s) => !s.effectiveCourtId)]) {
      const match = ownClubBookings.find(
        (b) => !used.has(b.externalBookingId) && overlaps(b) && (!slot.effectiveCourtId || b.courtId === slot.effectiveCourtId),
      );
      if (match) {
        used.add(match.externalBookingId);
        out[slot.key] = match;
      }
    }
    return out;
  }, [ownClubBookings, window, reservations.slots]);
  const ownBookingSlotKeys = useMemo(() => new Set(Object.keys(ownBySlot)), [ownBySlot]);
  const providerName = providerDisplayName(club.integrationType ?? null);


  // Errors are reported per call site: inline in the slot sheet, toast elsewhere.
  const mutations = useCourtSlotsMutations({
    gameId: game.id,
    gameCourts: input.gameCourts,
    slots: reservations.slots,
    courtSlotCount: game.courtSlotCount ?? null,
    onChanged: applyWrite,
  });

  const linkOwnBooking = useCallback(
    async (slot: CourtSlotView): Promise<CourtSlotsMutationOutcome | null> => {
      const booking = ownBySlot[slot.key];
      if (!booking) return null;
      return mutations.linkBooking(slot.courtId ? slot : { ...slot, courtId: booking.courtId }, booking.body);
    },
    [ownBySlot, mutations],
  );

  const openSheet = useCallback((key: string | null) => {
    setSheetError(null);
    setOpenSlotKey(key);
  }, []);

  /* ---------------- reschedule runner ---------------- */

  const executors = useMemo(
    () =>
      createReservationExecutors(
        {
          gameId: game.id,
          club,
          timeZone,
          slots: {
            gameCourts: input.gameCourts,
            reportedAnyCourtCount: input.reportedAnyCourtCount ?? 0,
            courtSlotCount: game.courtSlotCount ?? null,
          },
        },
        defaultReservationExecutorDeps(),
      ),
    [game.id, club, timeZone, input, game.courtSlotCount],
  );
  const server = useMemo(() => createServerRunJournal(game.id), [game.id]);
  const loadServerJournal = useMemo(() => createServerJournalLoader(game.id), [game.id]);
  const runner = useReservationChangeRunner({
    gameId: game.id,
    executors,
    canCancel: providerCanCancel,
    server,
    loadServerJournal,
    onSettled: () => void refresh(),
  });
  const { journal, unfinished, busy: runnerBusy, dismiss: dismissRun } = runner;

  // A fresh edit never opens on the last finished run's checklist.
  const wasEditorOpen = useRef(false);
  useEffect(() => {
    const opened = editorOpen && !wasEditorOpen.current;
    wasEditorOpen.current = editorOpen;
    if (opened && journal && !unfinished && !runnerBusy && journal.phase !== 'running') dismissRun();
  }, [editorOpen, journal, unfinished, runnerBusy, dismissRun]);

  const linkTimes = useMemo(() => {
    const out: Record<string, { start?: string | null; end?: string | null; courtId?: string | null }> = {};
    for (const l of links) out[l.externalBookingId] = { start: l.bookingStart, end: l.bookingEnd, courtId: l.courtId };
    return out;
  }, [links]);

  const followUps = useMemo(
    () =>
      mergeClubFollowUps(
        clubFollowUpsFromPayload(game.pendingClubFollowUps),
        clubFollowUpsFromRun(journal, linkTimes),
      ).filter((f) => !dismissedFollowUps.has(f.id)),
    [game.pendingClubFollowUps, journal, linkTimes, dismissedFollowUps],
  );

  const drifts = useMemo(() => collectReservationDrifts(links), [links]);

  /* ---------------- reserve / link ---------------- */

  const startReserve = useCallback(
    (slots: readonly CourtSlotView[], opts: { pickedCourtId?: string | null; replace?: string[] } = {}) => {
      const plan = planSlotReservations({
        slots,
        allSlots: reservations.slots,
        window,
        provider: club.integrationType,
        clubCourts,
        occupancy: occupancy.blocks,
        pickedCourtId: opts.pickedCourtId,
      });
      if (!plan.ok) {
        toast.error(t(plan.reason === 'no_time' ? 'gameDetails.courts.needTime' : 'gameDetails.courts.pickCourtFirst'));
        return;
      }
      openSheet(null);
      setReserve({ entries: plan.entries, replace: opts.replace });
    },
    [reservations.slots, window, club.integrationType, clubCourts, occupancy.blocks, t, openSheet],
  );

  /**
   * An own reservation at this time on another court, not linked here and not already offered
   * for a slot: booking one more court would leave the organizer holding two.
   */
  const ownBookingElsewhere = useCallback(
    (targets: readonly CourtSlotView[]): OwnClubBooking | null =>
      findOwnBookingElsewhere({
        own: ownClubBookings,
        window,
        offeredIds: new Set(Object.values(ownBySlot).map((b) => b.externalBookingId)),
        targets,
      }),
    [ownClubBookings, window, ownBySlot],
  );

  const reserveUnlessOwnElsewhere = useCallback(
    (targets: CourtSlotView[], opts: { pickedCourtId?: string | null } = {}) => {
      const booking = ownBookingElsewhere(targets);
      if (booking) {
        openSheet(null);
        setOwnElsewhere({ targets, opts, booking });
        return;
      }
      startReserve(targets, opts);
    },
    [ownBookingElsewhere, openSheet, startReserve],
  );

  const linkOwnElsewhere = useCallback(async () => {
    if (!ownElsewhere) return;
    const { targets, opts, booking } = ownElsewhere;
    // No gameCourtId: the server puts it on its court, taking over the planned empty court.
    const outcome = await mutations.linkBooking({ gameCourtId: null }, booking.body);
    setOwnElsewhere(null);
    if (!outcome.ok) {
      showError(outcome.error);
      return;
    }
    if (targets.length > 1) startReserve(targets.slice(1), opts);
  }, [ownElsewhere, mutations, showError, startReserve]);

  /** "Fill the gap": the shared planner decides what to book (provider lengths, blocks, own booking). */
  const startGapFill = useCallback(
    (slot: CourtSlotView) => {
      if (!window) {
        toast.error(t('gameDetails.courts.needTime'));
        return;
      }
      const result = planGapFill({ slot, window, provider: slot.provider ?? club.integrationType, blocks: occupancy.blocks });
      const message = gapFillUnavailableMessage(result, (id) => courtsById[id]?.name, clock.range);
      if (message) {
        toast.error(t(message.key, message.params));
        return;
      }
      const entries = gapFillEntries(result, slot);
      if (entries.length === 0) return;
      if (result.extraMinutes > 0) setGapConfirm({ entries, result });
      else setReserve({ entries });
    },
    [window, club.integrationType, occupancy.blocks, courtsById, clock, t],
  );

  const onCardAction = useCallback(
    (action: CourtsCardAction) => {
      if (action.kind === 'use_own') {
        const slot = reservations.slots.find((s) => s.key === action.slotKey);
        if (slot) {
          void linkOwnBooking(slot).then((outcome) => {
            if (outcome && !outcome.ok) showError(outcome.error);
          });
        }
        return;
      }
      if (action.kind !== 'reserve' && action.kind !== 'fill_gap') return;
      const targets =
        action.kind === 'reserve'
          ? reservations.slots.filter((s) => action.slotKeys.includes(s.key))
          : reservations.slots.filter((s) => s.key === action.slotKey);
      if (targets.length === 0) return;
      if (!canBookHere) {
        // No booking integration: the slot sheet offers link / mark as reserved.
        openSheet(targets[0].key);
        return;
      }
      if (action.kind === 'fill_gap') {
        startGapFill(targets[0]);
        return;
      }
      reserveUnlessOwnElsewhere(targets);
    },
    [reservations.slots, canBookHere, reserveUnlessOwnElsewhere, startGapFill, openSheet, linkOwnBooking, showError],
  );

  const onPickLink = useCallback(
    async (body: LinkBookingToGameBody, { sameCourt }: { sameCourt: boolean }) => {
      if (!linkSlot) return;
      // Either way the picker closes; a failure toasts. Another court: the server places it on its court.
      const outcome = await mutations.linkBooking(sameCourt ? linkSlot : { gameCourtId: null }, body);
      if (!outcome.ok) showError(outcome.error);
      setLinkSlot(null);
    },
    [linkSlot, mutations, showError],
  );

  /* ---------------- verify / cancel ---------------- */

  const verifyLink = useCallback(
    async (link: LinkedBookingPayload) => {
      setLocalPending('verify');
      try {
        const provider = await createHydratedClubBookingProvider(club);
        if (!provider?.verifyBooking) throw new Error('verify_unavailable');
        const present = await provider.verifyBooking(link.externalBookingId);
        let times: { start?: string; end?: string } = {};
        if (present) {
          try {
            const upcoming = await provider.listUpcoming();
            const match = upcoming.find((b) => b.externalBookingId === link.externalBookingId);
            if (match) {
              times = {
                start: booktimeIsoToUtcIso(match.bookingStart, timeZone) ?? match.bookingStart,
                end: booktimeIsoToUtcIso(match.bookingEnd, timeZone) ?? match.bookingEnd,
              };
            }
          } catch {
            /* presence alone is still worth reporting */
          }
        }
        await courtSlotsApi.reportUpstreamCheck(game.id, link.id, { present, ...times });
        toast[present ? 'success' : 'error'](t(present ? 'gameDetails.courts.verifyPresent' : 'gameDetails.courts.verifyMissing'));
        openSheet(null);
        void refresh();
      } catch {
        setSheetError(t('club.booktime.verifyFailed'));
      } finally {
        setLocalPending(null);
      }
    },
    [club, game.id, refresh, t, timeZone, openSheet],
  );

  const cancelAtClub = useCallback(async () => {
    const link = cancelLink;
    if (!link) return;
    setLocalPending('cancel_at_club');
    try {
      const provider = await createHydratedClubBookingProvider(club);
      if (!provider) throw new Error('cancel_unavailable');
      await provider.cancelBooking(link.externalBookingId, async () => true);
      let links: LinkedBookingPayload[] | null = null;
      try {
        links = await courtSlotsApi.unlinkBookings(game.id, [link.externalBookingId]);
      } catch {
        /* the server may already have dropped the link */
      }
      toast.success(t('club.booktime.cancelSuccess'));
      setCancelLink(null);
      openSheet(null);
      applyGame(links ? mergeLinkedBookingsIntoGame(gameRef.current, links) : null);
    } catch {
      toast.error(t('club.booktime.cancelFailed'));
    } finally {
      setLocalPending(null);
    }
  }, [cancelLink, club, game.id, applyGame, t, openSheet]);

  /* ---------------- slot sheet ---------------- */

  const linkById = useCallback((id: string | undefined) => links.find((l) => l.id === id) ?? null, [links]);

  /** Give a slot a court (any court → court; planned court → another court) without touching reservations. */
  const assignCourt = useCallback(
    async (slot: CourtSlotView, courtId: string) => {
      const body = buildCourtSlotsBody(
        {
          gameCourts: input.gameCourts,
          reportedAnyCourtCount: reportedAnyCourtCountOf(reservations.slots),
          courtSlotCount: game.courtSlotCount ?? null,
        },
        slot.courtId
          ? { kind: 'reassign_court', fromCourtId: slot.courtId, toCourtId: courtId }
          : { kind: 'assign_court', slot, courtId },
      );
      setAssigning(true);
      setSheetError(null);
      try {
        const view = await courtSlotsApi.putCourtSlots(game.id, body);
        openSheet(null);
        applyWrite({ kind: 'slots', view });
      } catch (error) {
        setSheetError(errorMessage(error));
      } finally {
        setAssigning(false);
      }
    },
    [input.gameCourts, reservations.slots, game.courtSlotCount, game.id, applyWrite, errorMessage, openSheet],
  );

  const onSlotAction = useCallback(
    async (action: CourtSlotSheetAction) => {
      const { slot } = action;
      setSheetError(null);
      /** Close on success; keep the sheet open with the error inline on failure. */
      const settle = (outcome: CourtSlotsMutationOutcome) => {
        if (outcome.ok) openSheet(null);
        else setSheetError(errorMessage(outcome.error));
      };
      switch (action.kind) {
        case 'use_own': {
          const outcome = await linkOwnBooking(slot);
          if (outcome) settle(outcome);
          return;
        }
        case 'assign_court':
          if (action.courtId) await assignCourt(slot, action.courtId);
          return;
        case 'reserve':
          reserveUnlessOwnElsewhere([slot], { pickedCourtId: action.courtId });
          return;
        case 'link':
          openSheet(null);
          setLinkSlot(action.courtId && !slot.courtId ? { ...slot, courtId: action.courtId } : slot);
          return;
        case 'mark_reserved':
          settle(
            slot.courtId == null && action.courtId
              ? await mutations.markReserved(slot, action.courtId)
              : await mutations.markReserved(slot),
          );
          return;
        case 'mark_not_reserved':
          settle(await mutations.markNotReserved(slot));
          return;
        case 'unlink': {
          const link = linkById(action.linkId) ?? slot.links[0];
          if (link) setConfirmUnlink({ slot, link: link as LinkedBookingPayload });
          return;
        }
        case 'verify': {
          const link = linkById(action.linkId);
          if (link) await verifyLink(link);
          return;
        }
        case 'cancel_at_club': {
          const link = linkById(action.linkId);
          if (link) setCancelLink(link);
          return;
        }
      }
    },
    [reserveUnlessOwnElsewhere, mutations, linkById, verifyLink, assignCourt, openSheet, errorMessage, linkOwnBooking],
  );

  const removeFromGame = useCallback(async () => {
    const target = confirmUnlink;
    if (!target) return;
    const outcome = await mutations.unlink([target.link.externalBookingId]);
    setConfirmUnlink(null);
    if (outcome.ok) openSheet(null);
    else setSheetError(errorMessage(outcome.error));
  }, [confirmUnlink, mutations, openSheet, errorMessage]);

  const openLink = openSlot?.links[0] ?? null;
  const openSlotOwned = openLink ? viewer.ownsBooking(openLink.externalBookingId) : false;
  const sheetCanVerify = useCallback((provider: string) => openSlotOwned && providerCanVerify(provider), [openSlotOwned]);
  const sheetCapabilities = useMemo<ProviderCapabilityOverrides | undefined>(
    () => (openLink && !openSlotOwned ? { [openLink.provider]: { canCancel: false } } : undefined),
    [openLink, openSlotOwned],
  );
  const pickableCourts = useMemo(
    () => freeCourtsForWindow(reservations.slots, clubCourts, occupancy.blocks, window),
    [reservations.slots, clubCourts, occupancy.blocks, window],
  );

  /* ---------------- drift ---------------- */

  const onDriftAction = useCallback(
    async (drift: ReservationDrift, kind: DriftActionKind) => {
      if (kind === 'unlink') {
        setPendingDrift(`${drift.linkId}:${kind}`);
        const outcome = await mutations.unlink([drift.externalBookingId]);
        if (!outcome.ok) showError(outcome.error);
        setPendingDrift(null);
        return;
      }
      if (kind === 'reserve_again') {
        const slot = reservations.slots.find((s) => s.links.some((l) => l.id === drift.linkId));
        if (!slot) return;
        if (canBookHere) startReserve([slot], { replace: [drift.externalBookingId] });
        else setLinkSlot(slot);
        return;
      }
      setPendingDrift(`${drift.linkId}:${kind}`);
      try {
        const response = await courtSlotsApi.acceptUpstream(game.id, drift.linkId, { mode: kind });
        applyGame(mergeAcceptUpstreamIntoGame(gameRef.current, response.data as AcceptUpstreamResult | undefined));
      } catch (error) {
        showError(error);
      } finally {
        setPendingDrift(null);
      }
    },
    [mutations, reservations.slots, canBookHere, startReserve, game.id, applyGame, showError],
  );

  const onFollowUpDone = useCallback(
    (id: string) => {
      const followUp = followUps.find((f) => f.id === id);
      setDismissedFollowUps((prev) => new Set(prev).add(id));
      if (followUp?.changeId && followUp.idempotencyKey) {
        void mutations.markFollowUpDone(followUp).then((outcome) => {
          if (!outcome.ok) showError(outcome.error);
        });
      }
    },
    [followUps, mutations, showError],
  );

  const sheetPending = (assigning ? 'assign_court' : null) ?? localPending ?? (mutations.pending && mutations.pending !== 'follow_up_done' && mutations.pending !== 'set_count' ? mutations.pending : null);

  /* ---------------- the editor's planner bundle ---------------- */

  const openSlotBusy = useMemo(() => {
    if (!openSlot || !window || !openSlot.effectiveCourtId || openSlot.state !== 'planned') return null;
    const ws = parseInstantMs(window.start) ?? 0;
    const we = parseInstantMs(window.end) ?? 0;
    const blocks = occupancy.blocks.filter(
      (b) =>
        b.kind === 'club' &&
        b.courtId === openSlot.effectiveCourtId &&
        (parseInstantMs(b.start) ?? 0) < we &&
        (parseInstantMs(b.end) ?? 0) > ws,
    );
    if (blocks.length === 0) return null;
    return {
      start: blocks.map((b) => b.start).sort()[0],
      end: blocks.map((b) => b.end).sort().slice(-1)[0],
      notInAccount: ownClubBookings != null && !ownBySlot[openSlot.key],
    };
  }, [openSlot, window, occupancy.blocks, ownClubBookings, ownBySlot]);

  const releaseLinks = useCallback(
    async (choices: readonly { link: LinkedBookingPayload; cancel: boolean }[]) => {
      if (choices.length === 0) return;
      if (choices.some((c) => c.cancel)) {
        const provider = await createHydratedClubBookingProvider(club);
        if (!provider) throw new Error('cancel_unavailable');
        for (const c of choices) if (c.cancel) await provider.cancelBooking(c.link.externalBookingId, async () => true);
      }
      const next = await courtSlotsApi.unlinkBookings(
        game.id,
        choices.map((c) => c.link.externalBookingId),
      );
      applyGame(mergeLinkedBookingsIntoGame(gameRef.current, next));
    },
    [club, game.id, applyGame],
  );

  const planner = useMemo<SchedulePlanner>(
    () => ({
      slots: reservations.slots,
      courtsById,
      clubCourts,
      occupancy: occupancy.blocks,
      sharedWith,
      playerCount: timeChangeNoticeCount(game, userId),
      links: links.map((link) => ({
        link,
        canCancel: providerCanCancel(link.externalBookingProvider) && viewer.ownsBooking(link.externalBookingId) && !(sharedWith[link.id]?.length),
      })),
      run: journal,
      busy: runnerBusy,
      start: (plan: EffectiveReschedulePlan, from: IsoInterval, to: IsoInterval) => void runner.start(plan.steps, { from, to }),
      retry: () => void runner.resume(),
      dismissRun,
      resumeOther: () => void runner.resumeActive(),
      releaseLinks,
    }),
    [reservations.slots, courtsById, clubCourts, occupancy.blocks, sharedWith, game, userId, links, viewer, journal, runnerBusy, runner, dismissRun, releaseLinks],
  );

  const slotNotices = useMemo(() => {
    const out: Record<string, string> = {};
    for (const drift of drifts) {
      const slot = reservations.slots.find((s) => s.links.some((l) => l.id === drift.linkId));
      if (slot) out[slot.key] = t(drift.state === 'MISSING' ? 'gameDetails.courts.driftMissing' : 'gameDetails.courts.driftMoved');
    }
    return out;
  }, [drifts, reservations.slots, t]);

  const cancelPolicy = club.cancellationNoticeHours
    ? t('gameDetails.courts.cancelPolicy', { hours: club.cancellationNoticeHours })
    : '';

  const notices =
    (unfinished && journal) || drifts.length > 0 || reservations.extraCourts > 0 ? (
      <>
        {reservations.extraCourts > 0 ? (
          <p
            role="status"
            data-testid="extra-courts-notice"
            className="cr-enter rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-50"
          >
            {t('gameDetails.courts.extraCourts', { count: reservations.extraCourts })}
          </p>
        ) : null}
        {unfinished && journal ? (
          <UnfinishedChangesBanner
            journal={journal}
            timeZone={timeZone}
            busy={runnerBusy}
            onFinish={() => {
              openSchedule('time');
              void runner.resume();
            }}
            onUndo={() => void runner.undo()}
          />
        ) : null}
        <ReservationDriftBanner
          drifts={drifts}
          courtsById={courtsById}
          timeZone={timeZone}
          pending={pendingDrift}
          onAction={(drift, kind) => void onDriftAction(drift, kind)}
        />
      </>
    ) : null;

  const value: GameCourtsValue = {
    card: {
      reservations,
      window,
      courtsById,
      timeZone,
      courtNeed: courtNeedOf(game),
      playerCount: game.maxParticipants,
      clubName: club.name,
      hasClub: true,
      canEdit: true,
      onChange: openSchedule,
      followUps,
      onSlotPress: (slot) => openSheet(slot.key),
      onAction: onCardAction,
      onFollowUpDone,
      primaryBusy: mutations.pending != null || reserve != null,
      ownBookingSlotKeys,
      providerName,
      slotNotices,
      notices,
    },
    planner,
    openSlot: openSheet,
  };

  return (
    <GameCourtsContext.Provider value={value}>
      {children}

      <CourtSlotSheet
        open={openSlot != null}
        onOpenChange={(open) => !open && openSheet(null)}
        slot={openSlot}
        error={sheetError}
        window={window}
        courtsById={courtsById}
        timeZone={timeZone}
        canEdit
        canBookHere={canBookHere}
        canLink={canBookHere}
        canAssignCourt
        canVerify={sheetCanVerify}
        providerCapabilities={sheetCapabilities}
        sharedWith={sharedWith}
        pickableCourts={pickableCourts}
        pendingAction={sheetPending as CourtSlotSheetAction['kind'] | null}
        onAction={(action) => void onSlotAction(action)}
        ownBooking={
          openSlot && ownBySlot[openSlot.key]
            ? { start: ownBySlot[openSlot.key].start, end: ownBySlot[openSlot.key].end, providerName }
            : null
        }
        busyAtClub={openSlotBusy}
        clubName={club.name}
        clubPhone={club.phone ?? null}
        onSetTime={() => openSchedule('time')}
      />

      <GameCourtLinkSheet
        open={linkSlot != null}
        onOpenChange={(open) => !open && setLinkSlot(null)}
        game={game}
        club={club}
        courts={courts.length > 0 ? courts : (club.courts ?? [])}
        slot={linkSlot}
        busy={mutations.pending === 'link'}
        onPick={(body, opts) => void onPickLink(body, opts)}
        onOtherDays={() => openSchedule('club')}
      />

      {reserve ? (
        <GameCourtReserveFlow
          open
          onClose={() => setReserve(null)}
          game={game}
          club={club}
          entries={reserve.entries}
          replaceExternalBookingIds={reserve.replace}
          onLinked={refresh}
        />
      ) : null}

      <ConfirmationModal
        isOpen={gapConfirm != null}
        tone="info"
        onClose={() => setGapConfirm(null)}
        onConfirm={() => {
          if (gapConfirm) setReserve({ entries: gapConfirm.entries });
          setGapConfirm(null);
        }}
        title={t('gameDetails.courts.gapTitle')}
        message={gapConfirm ? gapExtraLines(gapConfirm.result, clock.range, t) : ''}
        confirmText={t('gameDetails.courts.gapContinue')}
        cancelText={t('common.cancel')}
      />

      <ConfirmationModal
        isOpen={ownElsewhere != null}
        tone="info"
        onClose={() => mutations.pending !== 'link' && setOwnElsewhere(null)}
        onConfirm={() => void linkOwnElsewhere()}
        title={t('gameDetails.courts.ownElsewhereTitle')}
        message={
          ownElsewhere
            ? t('gameDetails.courts.ownElsewhereMessage', {
                court: courtsById[ownElsewhere.booking.courtId]?.name ?? t('gameDetails.courts.theCourt'),
                range: clock.range(ownElsewhere.booking.start, ownElsewhere.booking.end),
              })
            : ''
        }
        confirmText={t('gameDetails.courts.ownElsewhereUse', {
          court: ownElsewhere ? courtsById[ownElsewhere.booking.courtId]?.name ?? t('gameDetails.courts.theCourt') : '',
        })}
        cancelText={t('common.cancel')}
        isLoading={mutations.pending === 'link'}
        closeOnConfirm={false}
      >
        <button
          type="button"
          className="mt-2 w-full text-center text-sm font-medium text-gray-500 underline-offset-2 hover:underline dark:text-gray-400"
          disabled={mutations.pending === 'link'}
          onClick={() => {
            if (!ownElsewhere) return;
            const { targets, opts } = ownElsewhere;
            setOwnElsewhere(null);
            startReserve(targets, opts);
          }}
        >
          {t('gameDetails.courts.ownElsewhereBookAnyway')}
        </button>
      </ConfirmationModal>

      <ConfirmationModal
        isOpen={confirmUnlink != null}
        onClose={() => mutations.pending !== 'unlink' && setConfirmUnlink(null)}
        onConfirm={() => void removeFromGame()}
        title={t('gameDetails.courts.removeTitle')}
        message={t('gameDetails.courts.removeMessage', {
          club: club.name,
          court: confirmUnlink ? courtsById[confirmUnlink.slot.effectiveCourtId ?? '']?.name ?? t('gameDetails.courts.theCourt') : '',
        })}
        confirmText={t('gameDetails.courts.removeConfirm')}
        cancelText={t('common.cancel')}
        isLoading={mutations.pending === 'unlink'}
        closeOnConfirm={false}
      />

      <ConfirmationModal
        isOpen={cancelLink != null}
        onClose={() => localPending !== 'cancel_at_club' && setCancelLink(null)}
        onConfirm={() => void cancelAtClub()}
        title={t('gameDetails.courts.cancelTitle', { club: club.name })}
        message={[
          cancelLink
            ? t(cancelLink.bookingStart && cancelLink.bookingEnd ? 'gameDetails.courts.cancelWhat' : 'gameDetails.courts.cancelWhatNoTime', {
                provider: providerDisplayName(cancelLink.externalBookingProvider),
                court: courtsById[cancelLink.courtId ?? '']?.name ?? t('gameDetails.courts.theCourt'),
                range: cancelLink.bookingStart && cancelLink.bookingEnd ? clock.range(cancelLink.bookingStart, cancelLink.bookingEnd) : '',
              })
            : '',
          cancelPolicy,
          t('gameDetails.courts.cancelMessage'),
        ]
          .filter(Boolean)
          .join(' ')}
        confirmText={t('club.booktime.cancelConfirmCta')}
        cancelText={t('common.cancel')}
        confirmVariant="danger"
        isLoading={localPending === 'cancel_at_club'}
        closeOnConfirm={false}
      />

    </GameCourtsContext.Provider>
  );
}
