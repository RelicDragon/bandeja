import {
  EntityType,
  ParticipantRole,
  ParticipantStatus,
  PlayIntentStatus,
  SpotOpenedKind,
} from '@prisma/client';
import prisma from '../../config/database';
import { spotOpenedDayKey } from './spotOpenedDelivery.service';
import { canMutateGameRoster } from '@bandeja/shared/gameMutationLock';
import { SystemMessageType, getUserDisplayName } from '../../utils/systemMessages';
import { createSystemMessage } from '../../controllers/chat.controller';
import { emitGameSeatFilled, emitGameSeatOpened } from '../socketEmitFacade';
import type { SpotOpenedCause } from '../game/availableGamesEnrichmentTypes';
import { validatePlayerCanJoinGame } from '../../utils/participantValidation';
import { fetchGameWithPlayingParticipants } from '../../utils/gameQueries';
import { buildSpotOpenedRecipients, queuePosition } from './spotOpenedRecipients';
import { selectAutoFillCandidate } from './autoFillCandidates';
import { notifySpotOpened, notifySeatedFromQueue } from './spotOpenedNotify.service';
import { listIntentUserIdsForGame } from './spotOpenedIntentRecipients';
import {
  listFollowerRecipientsForGame,
  type FollowerRecipient,
} from './spotOpenedFollowerRecipients';
import './spotOpenedEnricher';

/** Extra context the trigger site knows and the service cannot re-derive. */
export interface SeatOpenedOptions {
  /** Whoever gave the seat up, for the "A spot opened (Luka left)" message. */
  freedByUserId?: string | null;
}

/**
 * PRD 347 — a freed PLAYING seat is an event, not a side effect.
 *
 * Every trigger (`leaveGame`, `kickUser`, an invite decline that gave up a
 * playing seat, substitution, a `maxParticipants` increase) funnels through
 * here. The service re-derives the truth from the database rather than trusting
 * the caller, so a trigger that did not actually free a seat is a cheap no-op.
 *
 * **Never throws.** A notification failure must not surface inside the join or
 * leave request that caused it.
 */
export class GameSeatService {
  static async seatOpened(
    gameId: string,
    freedCount: number,
    cause: SpotOpenedCause,
    options: SeatOpenedOptions = {},
  ): Promise<void> {
    try {
      await runSeatOpened(gameId, freedCount, cause, options);
    } catch (error) {
      console.error('[gameSeat] seatOpened failed', { gameId, cause, error });
    }
  }

  /**
   * PRD 347 — an invite decline only "opens a spot" when the invite was the
   * thing keeping the game full.
   *
   * `INVITED` never counts toward slots (only `PLAYING` does), so a decline on
   * a half-empty roster changes nothing a player would notice and must not
   * raise the pill. It does matter when playing + held-invite seats exactly
   * filled the game: then the decline is what made a seat available again.
   * Call this **after** the decline has been committed.
   */
  static async seatOpenedFromInviteDecline(
    gameId: string,
    declinedUserId: string,
  ): Promise<void> {
    try {
      const [game, playing, invited] = await Promise.all([
        prisma.game.findUnique({ where: { id: gameId }, select: { maxParticipants: true } }),
        prisma.gameParticipant.count({
          where: { gameId, status: ParticipantStatus.PLAYING },
        }),
        prisma.gameParticipant.count({
          where: { gameId, status: ParticipantStatus.INVITED },
        }),
      ]);
      if (!game) return;
      if (playing + invited !== (game.maxParticipants || 0) - 1) return;
      await GameSeatService.seatOpened(gameId, 1, 'INVITE_DECLINED', {
        freedByUserId: declinedUserId,
      });
    } catch (error) {
      console.error('[gameSeat] seatOpenedFromInviteDecline failed', { gameId, error });
    }
  }
}

async function runSeatOpened(
  gameId: string,
  freedCount: number,
  cause: SpotOpenedCause,
  options: SeatOpenedOptions,
): Promise<void> {
  if (freedCount <= 0) return;

  const game = await loadSeatGame(gameId);
  if (!game) return;

  // The mutation lock is `resultsStatus`, never `Game.status` — and that holds
  // for the "is this seat still worth shouting about" check too. The window is
  // expressed as an explicit `startTime` comparison; the old
  // `status !== 'ANNOUNCED' && status !== 'STARTED'` line said the same thing
  // through the clock-derived column (`docs/product/constraints.md`).
  if (!canMutateGameRoster(game)) return;
  if (game.timeIsSet !== false && game.startTime.getTime() <= Date.now()) return;

  const playing = game.participants.filter((p) => p.status === ParticipantStatus.PLAYING);
  let openSeats = Math.max(0, (game.maxParticipants || 0) - playing.length);
  if (openSeats <= 0) return;

  const now = new Date();
  await prisma.game.update({
    where: { id: gameId },
    data: { lastSeatOpenedAt: now },
  });
  await emitGameSeatOpened(gameId, {
    freedCount: Math.min(freedCount, openSeats),
    cause,
    lastSeatOpenedAt: now.toISOString(),
  });

  await postSpotOpenedSystemMessage(gameId, options.freedByUserId ?? null);

  if (game.autoFillFromQueue) {
    const seatedUserId = await autoFillFromQueue(game);
    if (seatedUserId) {
      openSeats -= 1;
      await emitGameSeatFilled(gameId, { userId: seatedUserId });
      await postSeatedFromQueueSystemMessage(gameId, seatedUserId);
      await notifySeatedFromQueue(game, seatedUserId);
    }
  }

  if (openSeats <= 0) return;

  await dispatchSpotOpenedNotifications(game, now);
}

type SeatGame = NonNullable<Awaited<ReturnType<typeof loadSeatGame>>>;

async function loadSeatGame(gameId: string) {
  return prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      resultsStatus: true,
      entityType: true,
      sport: true,
      cityId: true,
      clubId: true,
      isPublic: true,
      startTime: true,
      endTime: true,
      timeIsSet: true,
      maxParticipants: true,
      minLevel: true,
      maxLevel: true,
      genderTeams: true,
      autoFillFromQueue: true,
      club: { select: { name: true } },
      court: { select: { club: { select: { name: true } } } },
      city: { select: { timezone: true } },
      participants: {
        select: {
          id: true,
          userId: true,
          status: true,
          role: true,
          joinedAt: true,
        },
      },
    },
  });
}

export { spotOpenedDayKey };

async function postSpotOpenedSystemMessage(
  gameId: string,
  freedByUserId: string | null,
): Promise<void> {
  if (!freedByUserId) return;
  try {
    const user = await prisma.user.findUnique({
      where: { id: freedByUserId },
      select: { firstName: true, lastName: true },
    });
    if (!user) return;
    await createSystemMessage(gameId, {
      type: SystemMessageType.GAME_SPOT_OPENED,
      variables: { userName: getUserDisplayName(user.firstName, user.lastName) },
    });
  } catch (error) {
    console.error('[gameSeat] failed to post spot-opened system message', { gameId, error });
  }
}

async function postSeatedFromQueueSystemMessage(
  gameId: string,
  userId: string,
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    if (!user) return;
    await createSystemMessage(gameId, {
      type: SystemMessageType.GAME_SEAT_AUTO_FILLED,
      variables: { userName: getUserDisplayName(user.firstName, user.lastName) },
    });
  } catch (error) {
    console.error('[gameSeat] failed to post seated-from-queue system message', { gameId, error });
  }
}

/**
 * Promotes the first queued player who passes the gates.
 *
 * The promotion itself reuses `ParticipantService.acceptNonPlayingParticipant`,
 * so the roster write, the play-intent consume, the "joined" chat message and
 * the game-update emit behave exactly like a manual organizer accept.
 *
 * **Level gate:** the manual path passes `skipLevelCheck: true` because an
 * organizer accepting by hand is a deliberate override. Auto-fill has no human
 * in the loop, so it pre-checks the level range itself (`skipLevelCheck` left
 * off) before delegating — the PRD requires that "gender and level rules still
 * apply".
 */
async function autoFillFromQueue(game: SeatGame): Promise<string | null> {
  const owner = game.participants.find((p) => p.role === ParticipantRole.OWNER);
  if (!owner) return null;

  const queue = game.participants.filter((p) => p.status === ParticipantStatus.IN_QUEUE);
  if (queue.length === 0) return null;

  const candidate = await selectAutoFillCandidate(queue, async (entry) => {
    const current = await fetchGameWithPlayingParticipants(prisma, game.id);
    const result = await validatePlayerCanJoinGame(current, entry.userId, {
      targetIsOtherUser: true,
    });
    return result.canJoin;
  });
  if (!candidate) return null;

  try {
    // Deferred import: `participant.service` calls back into this module from
    // `leaveGame`, and a static import would close that cycle at module init.
    const { ParticipantService } = await import('../game/participant.service');
    await ParticipantService.acceptNonPlayingParticipant(
      game.id,
      owner.userId,
      candidate.userId,
    );
    return candidate.userId;
  } catch (error) {
    console.error('[gameSeat] auto-fill promotion failed', {
      gameId: game.id,
      userId: candidate.userId,
      error,
    });
    return null;
  }
}

async function dispatchSpotOpenedNotifications(game: SeatGame, now: Date): Promise<void> {
  const fresh = await prisma.gameParticipant.findMany({
    where: { gameId: game.id },
    select: { userId: true, status: true, role: true, joinedAt: true },
  });

  const seatedUserIds = fresh
    .filter((p) => p.status === ParticipantStatus.PLAYING)
    .map((p) => p.userId);
  const queueUserIds = fresh
    .filter((p) => p.status === ParticipantStatus.IN_QUEUE)
    .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())
    .map((p) => p.userId);
  const ownerUserId =
    fresh.find((p) => p.role === ParticipantRole.OWNER)?.userId ?? null;

  const canRadar =
    game.isPublic &&
    Boolean(game.clubId) &&
    (game.entityType === EntityType.GAME || game.entityType === EntityType.BAR);

  const [intentUserIds, followers] = await Promise.all([
    canRadar
      ? listIntentUserIdsForGame(game, now, PlayIntentStatus.OPEN).catch((error) => {
          console.error('[gameSeat] intent recipients failed', error);
          return [] as string[];
        })
      : Promise.resolve([] as string[]),
    game.isPublic
      ? listFollowerRecipientsForGame(game, seatedUserIds).catch((error) => {
          console.error('[gameSeat] follower recipients failed', error);
          return [] as FollowerRecipient[];
        })
      : Promise.resolve([] as FollowerRecipient[]),
  ]);

  const followedNameByUserId = new Map(
    followers.map((entry) => [entry.userId, entry.followedUserName]),
  );

  const recipients = buildSpotOpenedRecipients({
    queueUserIds,
    intentUserIds,
    followerUserIds: followers.map((entry) => entry.userId),
    ownerUserId,
    isPublic: game.isPublic,
    seatedUserIds,
  });
  if (recipients.length === 0) return;

  const dayKey = spotOpenedDayKey(game.city?.timezone, now);

  await notifySpotOpened({
    game,
    dayKey,
    spotOpenedAt: now.toISOString(),
    recipients: recipients.map((recipient) => ({
      ...recipient,
      queuePosition:
        recipient.kind === SpotOpenedKind.QUEUE
          ? queuePosition(queueUserIds, recipient.userId)
          : null,
      followedUserName:
        recipient.kind === SpotOpenedKind.FOLLOWER
          ? followedNameByUserId.get(recipient.userId) ?? null
          : null,
    })),
  });
}

export type { SeatGame };
