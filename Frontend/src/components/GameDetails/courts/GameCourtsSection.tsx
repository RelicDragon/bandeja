/**
 * Courts on the game page — the one place a game's court slots and their
 * reservations live (replaces the old "multiple courts" card and the linked
 * bookings section). Everyone sees the `CourtsCard`; organizers also get:
 *  - row tap → `CourtSlotSheet` (reserve now, link my reservation, mark as
 *    reserved / not reserved, verify, unlink, cancel at the club);
 *  - the court-count stepper and the card's one primary action;
 *  - club-side drift (`ReservationDriftBanner`), an unfinished reservation
 *    change (`UnfinishedChangesBanner`) and "to do at the club" follow-ups;
 *  - the reschedule planner (`RescheduleSheet`), opened by the page's
 *    "change time" entries (`rescheduleOpen`).
 * Every write goes through `@/api/courtSlots` (`?timePolicy=explicit`); its
 * response is applied to the game at once (`applyCourtSlotsWrite`) and the
 * full game is re-fetched in the background. Only one sheet is open at a time:
 * an action that succeeds closes the slot sheet (a failure stays inline), and
 * opening the reschedule planner closes the slot / link sheets.
 * Domain: docs/domains/booking.md (Court slots, Clash guard, Club-side drift,
 * Reschedule journal).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { Club, Court, Game } from '@/types';
import type { CourtSlotView } from '@shared/gameBooking/courtReservations';
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
import { createHydratedClubBookingProvider } from '@/integrations/booking/createClubBookingProvider';
import { useGameLinkedBookingViewer } from '@/hooks/useGameLinkedBookingViewer';
import { buildCourtReservationsInput } from '@/utils/courtReservationView';
import { getClubTimezone } from '@/utils/gameTimeDisplay';
import {
  CourtSlotSheet,
  CourtsCard,
  applyCourtSlotsWrite,
  mergeAcceptUpstreamIntoGame,
  mergeLinkedBookingsIntoGame,
  buildCourtSlotsBody,
  RescheduleSheet,
  ReservationDriftBanner,
  UnfinishedChangesBanner,
  clubFollowUpsFromPayload,
  clubFollowUpsFromRun,
  collectReservationDrifts,
  courtCountBounds,
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
  type CourtsPrimaryAction,
  type DriftActionKind,
  type ReservationDrift,
} from '@/features/court-reservations';
import type { LinkedBookingPayload } from '@/features/court-reservations/courtReservationsInput';
import { reportedAnyCourtCountOf } from '@/features/court-reservations/courtReservationsModel';
import {
  buildCourtsById,
  clubCanBookHere,
  courtClashDetails,
  describeCourtClash,
  freeCourtsForWindow,
  GAME_COURTS_SECTION_ID,
  gapExtraLines,
  gapFillEntries,
  gapFillUnavailableMessage,
  gameShowsCourtsSection,
  gameWindow,
  planSlotReservations,
  providerCanVerify,
  resolveGameClub,
  timeChangeNoticeCount,
  type ReserveEntry,
} from './gameCourtsModel';
import { gameCourtsQueryKeys, useGameCourtOccupancy, useGameSharedWith } from './useGameCourtsData';
import { GameCourtReserveFlow } from './GameCourtReserveFlow';
import { GameCourtLinkSheet } from './GameCourtLinkSheet';

export type GameCourtsSectionProps = {
  game: Game;
  /** The club's courts (shell list, sport-filtered). */
  courts: Court[];
  clubs: Club[];
  /** Owner/admin while the game is still open. */
  canEdit: boolean;
  onGameUpdate: (game: Game) => void;
  /** The reschedule planner (organizers; ignored for read-only viewers). */
  rescheduleOpen?: boolean;
  onRescheduleOpenChange?: (open: boolean) => void;
};

function courtRefs(courts: readonly Court[]): CourtRef[] {
  return courts.map((c) => ({ id: c.id, name: c.name, externalCourtId: c.externalCourtId ?? null, isIndoor: c.isIndoor }));
}

export function GameCourtsSection(props: GameCourtsSectionProps) {
  const { game, clubs, courts, canEdit } = props;
  const club = useMemo(() => resolveGameClub(game, clubs, courts), [game, clubs, courts]);
  if (!gameShowsCourtsSection(game)) return null;
  return (
    <div id={GAME_COURTS_SECTION_ID} className="flex scroll-mt-24 flex-col gap-2">
      {canEdit && club ? <OrganizerCourts {...props} club={club} /> : <ReadOnlyCourts game={game} club={club} />}
    </div>
  );
}

function ReadOnlyCourts({ game, club }: { game: Game; club: Club | undefined }) {
  const reservations = useMemo(() => deriveGameCourtReservations(game), [game]);
  const courtsById = useMemo(() => buildCourtsById(club, game), [club, game]);
  return (
    <CourtsCard
      reservations={reservations}
      window={gameWindow(game)}
      courtsById={courtsById}
      timeZone={getClubTimezone(game) ?? club?.city?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone}
      playerCount={game.maxParticipants}
      clubName={club?.name ?? null}
      canEdit={false}
    />
  );
}

type ReserveRequest = { entries: ReserveEntry[]; replace?: string[] };

function OrganizerCourts({
  game,
  courts,
  club,
  onGameUpdate,
  rescheduleOpen = false,
  onRescheduleOpenChange,
}: GameCourtsSectionProps & { club: Club }) {
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
  const [assigning, setAssigning] = useState(false);
  const [cancelLink, setCancelLink] = useState<LinkedBookingPayload | null>(null);
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

  // Errors are reported per call site: inline in the slot sheet, toast elsewhere.
  const mutations = useCourtSlotsMutations({
    gameId: game.id,
    gameCourts: input.gameCourts,
    slots: reservations.slots,
    courtSlotCount: game.courtSlotCount ?? null,
    onChanged: applyWrite,
  });

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

  // One sheet at a time: the reschedule planner replaces the slot / link sheets.
  useEffect(() => {
    if (!rescheduleOpen) return;
    setOpenSlotKey(null);
    setLinkSlot(null);
    setSheetError(null);
  }, [rescheduleOpen]);

  // A fresh "change time" never opens on the last finished run's checklist.
  const wasRescheduleOpen = useRef(false);
  useEffect(() => {
    const opened = rescheduleOpen && !wasRescheduleOpen.current;
    wasRescheduleOpen.current = rescheduleOpen;
    if (opened && journal && !unfinished && !runnerBusy && journal.phase !== 'running') dismissRun();
  }, [rescheduleOpen, journal, unfinished, runnerBusy, dismissRun]);

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

  const onPrimaryAction = useCallback(
    (action: CourtsPrimaryAction) => {
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
      startReserve(targets);
    },
    [reservations.slots, canBookHere, startReserve, startGapFill, openSheet],
  );

  const onPickLink = useCallback(
    async (body: LinkBookingToGameBody) => {
      if (!linkSlot) return;
      // Either way the picker closes; a failure toasts.
      const outcome = await mutations.linkBooking(linkSlot, body);
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
        case 'assign_court':
          if (action.courtId) await assignCourt(slot, action.courtId);
          return;
        case 'reserve':
          startReserve([slot], { pickedCourtId: action.courtId });
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
          if (!link) return;
          settle(await mutations.unlink([link.externalBookingId]));
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
    [startReserve, mutations, linkById, verifyLink, assignCourt, openSheet, errorMessage],
  );

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

  const assignedCount = input.gameCourts.length;
  const bounds = courtCountBounds(assignedCount);
  const sheetPending = (assigning ? 'assign_court' : null) ?? localPending ?? (mutations.pending && mutations.pending !== 'follow_up_done' && mutations.pending !== 'set_count' ? mutations.pending : null);

  return (
    <>
      {unfinished && journal ? (
        <UnfinishedChangesBanner
          journal={journal}
          timeZone={timeZone}
          busy={runnerBusy}
          onFinish={() => {
            onRescheduleOpenChange?.(true);
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

      <CourtsCard
        reservations={reservations}
        window={window}
        courtsById={courtsById}
        timeZone={timeZone}
        playerCount={game.maxParticipants}
        clubName={club.name}
        canEdit
        followUps={followUps}
        onSlotPress={(slot) => openSheet(slot.key)}
        onPrimaryAction={onPrimaryAction}
        onFollowUpDone={onFollowUpDone}
        primaryBusy={mutations.pending != null || reserve != null}
        courtCount={{
          value: Math.max(bounds.min, game.courtSlotCount ?? reservations.slots.length),
          ...bounds,
          busy: mutations.pending === 'set_count',
          onChange: (count) =>
            void mutations.setCourtCount(count).then((outcome) => {
              if (!outcome.ok) showError(outcome.error);
            }),
        }}
      />

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
        canAssignCourt
        canVerify={sheetCanVerify}
        providerCapabilities={sheetCapabilities}
        sharedWith={sharedWith}
        pickableCourts={pickableCourts}
        pendingAction={sheetPending as CourtSlotSheetAction['kind'] | null}
        onAction={(action) => void onSlotAction(action)}
      />

      <GameCourtLinkSheet
        open={linkSlot != null}
        onOpenChange={(open) => !open && setLinkSlot(null)}
        game={game}
        club={club}
        courts={club.courts ?? courts}
        slot={linkSlot}
        busy={mutations.pending === 'link'}
        onPick={(body) => void onPickLink(body)}
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
        isOpen={cancelLink != null}
        onClose={() => localPending !== 'cancel_at_club' && setCancelLink(null)}
        onConfirm={() => void cancelAtClub()}
        title={t('club.booktime.cancelConfirmTitle')}
        message={t('gameDetails.courts.cancelMessage')}
        confirmText={t('club.booktime.cancelConfirmCta')}
        cancelText={t('common.cancel')}
        confirmVariant="danger"
        isLoading={localPending === 'cancel_at_club'}
        closeOnConfirm={false}
      />

      {window ? (
        <RescheduleSheet
          key={`${window.start}:${window.end}`}
          open={rescheduleOpen}
          onOpenChange={(open) => {
            onRescheduleOpenChange?.(open);
            if (!open && journal && journal.phase !== 'running' && !unfinished) dismissRun();
          }}
          gameId={game.id}
          currentWindow={window}
          slots={reservations.slots}
          courtsById={courtsById}
          clubCourts={clubCourts}
          timeZone={timeZone}
          occupancy={occupancy.blocks}
          sharedWith={sharedWith}
          playerCount={timeChangeNoticeCount(game, userId)}
          run={journal}
          onConfirm={(plan, newWindow) => void runner.start(plan.steps, { from: window, to: newWindow })}
          onRetry={() => void runner.resume()}
          onDismissRun={dismissRun}
        />
      ) : null}
    </>
  );
}
