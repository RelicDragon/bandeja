/**
 * PRD 346 — attendance confirmation and no-show notes.
 *
 * **Product principle (load-bearing).** Confirmation is a courtesy signal, never
 * a contract. Nothing in this file removes a player, changes a seat, reorders a
 * queue, or writes `level` / `reliability` / `ratingUncertainty` /
 * `LevelChangeEvent`. The only writes are the four attendance columns on
 * `GameParticipant` (guarded by `assertAttendanceUpdateIsSafe`) and the two
 * informational counters on `UserSportProfile`. There is no deadline and no
 * auto-release.
 */
import { EntityType, type ParticipantAttendance } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { emitGameAttendanceUpdated } from '../socketEmitFacade';
import { registerPushActionHandler } from '../push/pushActionHandlers';
import { registerAvailableGamesEnricher } from '../game/availableGamesEnrichment';
import type {
  AttendanceSummary,
  AttendanceSummaryEntry,
} from '../game/availableGamesEnrichmentTypes';
import { createSystemMessageWithNotification } from '../../utils/systemMessageHelper';
import { SystemMessageType } from '../../utils/systemMessages';
import notificationService from '../notification.service';
import { NotificationType } from '../../types/notifications.types';
import { createGameNoShowNotedPushNotification } from '../push/notifications/game-no-show-noted-push.notification';
import {
  refreshAttendanceCounters,
  refreshAttendanceCountersForGame,
} from './attendanceCounters.service';
import {
  ATTENDANCE_NUDGE_COOLDOWN_HOURS,
  type AttendanceAnswer,
  buildAnswerUpdate,
  buildNoShowNoteUpdate,
  buildNoShowUndoUpdate,
  countAttendance,
  evaluateNudgeCooldown,
  gameAcceptsAttendanceAnswers,
  isAttendanceAnswer,
  isImplicitlyConfirmedOwner,
  isWithinNoShowWindow,
  type NudgeCooldown,
  OWNER_IMPLICIT_ANSWER,
  withOwnerImplicitAnswer,
} from './attendanceRules';

export { ATTENDANCE_NUDGE_COOLDOWN_HOURS };

/** Entity types that have an attendance question at all. EVENT RSVPs are out of scope. */
const ATTENDANCE_ENTITY_TYPES: EntityType[] = [
  EntityType.GAME,
  EntityType.TOURNAMENT,
  EntityType.TRAINING,
  EntityType.LEAGUE,
  EntityType.BAR,
];

/** Marker stored in the nudge system message; also how the cooldown is read back. */
const NUDGE_MESSAGE_MARKER = `"type":"${SystemMessageType.ATTENDANCE_NUDGED}"`;

export type AttendanceGame = {
  id: string;
  status: string;
  /** The mutation lock (`docs/product/constraints.md`) — never `status`. */
  resultsStatus: string;
  timeIsSet: boolean;
  startTime: Date;
  endTime: Date;
  entityType: EntityType;
};

export type AttendanceActionResult = {
  attendance: ParticipantAttendance;
  summary: AttendanceSummary;
};

/**
 * Push / Telegram action name → attendance answer. Anything else is refused,
 * so a `keep` or `accept` token can never fall through into an answer.
 */
const ATTENDANCE_ACTION_TO_ANSWER: Partial<Record<string, AttendanceAnswer>> = {
  confirm: 'CONFIRMED',
  unsure: 'UNSURE',
};

export function supportsAttendance(entityType: EntityType): boolean {
  return ATTENDANCE_ENTITY_TYPES.includes(entityType);
}

async function loadGameForAttendance(gameId: string): Promise<AttendanceGame> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      status: true,
      resultsStatus: true,
      timeIsSet: true,
      startTime: true,
      endTime: true,
      entityType: true,
    },
  });
  if (!game) {
    throw new ApiError(404, 'errors.attendance.gameNotFound');
  }
  return game;
}

/**
 * The roster as attendance reads it: the owner's PLAYING row always reads
 * `CONFIRMED` ({@link withOwnerImplicitAnswer}). Coercing here rather than in
 * each projection means the dots, the counts, the socket payload and the
 * viewer's own state can never disagree about the organizer.
 */
async function loadRoster(gameId: string) {
  const rows = await prisma.gameParticipant.findMany({
    where: { gameId },
    select: {
      userId: true,
      status: true,
      role: true,
      attendance: true,
      attendanceUpdatedAt: true,
      noShowNotedAt: true,
      noShowNotedById: true,
      joinedAt: true,
    },
    orderBy: { joinedAt: 'asc' },
  });
  return withOwnerImplicitAnswer(rows);
}

/**
 * The minimum a row needs for the summary. Kept structural so the batched
 * enricher query (which selects fewer columns than {@link loadRoster}) can feed
 * the same projection without widening its select.
 */
type SummaryRosterRow = {
  userId: string;
  status: string;
  role?: string | null;
  attendance: ParticipantAttendance;
};

function projectSummary(
  roster: readonly SummaryRosterRow[],
  viewerUserId?: string,
): AttendanceSummary {
  const counts = countAttendance(roster);
  const viewer = viewerUserId
    ? roster.find((row) => row.userId === viewerUserId && row.status === 'PLAYING')
    : undefined;
  const entries: AttendanceSummaryEntry[] = roster
    .filter((row) => row.status === 'PLAYING')
    .map((row) => ({ userId: row.userId, attendance: row.attendance }));

  return {
    confirmedCount: counts.confirmedCount,
    unsureCount: counts.unsureCount,
    unansweredCount: counts.unansweredCount,
    playingCount: counts.playingCount,
    viewerAttendance: viewer ? viewer.attendance : null,
    entries,
  };
}

export type AttendanceDetails = AttendanceSummary & {
  /** Per-player rows the roster dots and the no-show tag read. */
  participants: {
    userId: string;
    attendance: ParticipantAttendance;
    attendanceUpdatedAt: string | null;
    noShowNotedAt: string | null;
    noShowNotedById: string | null;
  }[];
  /** `false` when the game has no time set or has already started. */
  answersOpen: boolean;
  /** `true` while the organizer can still note or undo a no-show. */
  noShowWindowOpen: boolean;
  nudge: NudgeCooldown;
};

export async function getAttendanceDetails(
  gameId: string,
  viewerUserId?: string,
  now: Date = new Date(),
): Promise<AttendanceDetails> {
  const game = await loadGameForAttendance(gameId);
  const roster = await loadRoster(gameId);
  const summary = projectSummary(roster, viewerUserId);

  return {
    ...summary,
    participants: roster
      .filter((row) => row.status === 'PLAYING')
      .map((row) => ({
        userId: row.userId,
        attendance: row.attendance,
        attendanceUpdatedAt: row.attendanceUpdatedAt?.toISOString() ?? null,
        noShowNotedAt: row.noShowNotedAt?.toISOString() ?? null,
        noShowNotedById: row.noShowNotedById ?? null,
      })),
    answersOpen: supportsAttendance(game.entityType) && gameAcceptsAttendanceAnswers(game, now),
    noShowWindowOpen:
      supportsAttendance(game.entityType) && isWithinNoShowWindow(game.endTime, now),
    nudge: await readNudgeCooldown(gameId, now),
  };
}

/**
 * `userId` is the player the change is *about* (not the actor), and `attendance`
 * is that player's state — the organizer noting a no-show must not broadcast
 * their own answer as if it were the target's.
 */
async function emitSummary(
  gameId: string,
  userId: string,
  attendance: ParticipantAttendance,
  summary: AttendanceSummary,
) {
  await emitGameAttendanceUpdated(gameId, {
    userId,
    attendance,
    confirmedCount: summary.confirmedCount,
    playingCount: summary.playingCount,
  });
}

function attendanceOf(
  roster: readonly SummaryRosterRow[],
  userId: string,
): ParticipantAttendance {
  return roster.find((row) => row.userId === userId)?.attendance ?? 'UNANSWERED';
}

/**
 * Records a player's own answer. Idempotent: answering the same way twice is a
 * no-op that still returns the current summary.
 */
export async function setAttendance(
  gameId: string,
  userId: string,
  answer: AttendanceAnswer,
  now: Date = new Date(),
): Promise<AttendanceActionResult> {
  const game = await loadGameForAttendance(gameId);

  if (!supportsAttendance(game.entityType)) {
    throw new ApiError(400, 'errors.attendance.notSupported');
  }
  if (!gameAcceptsAttendanceAnswers(game, now)) {
    throw new ApiError(400, 'errors.attendance.answersClosed');
  }

  const participant = await prisma.gameParticipant.findFirst({
    where: { gameId, userId },
    select: { id: true, status: true, role: true, attendance: true },
  });
  if (!participant || participant.status !== 'PLAYING') {
    throw new ApiError(403, 'errors.attendance.notParticipant');
  }

  // The owner is confirmed by virtue of organizing. No surface asks them, so
  // anything that gets here is stale — an old client, or a push tapped after
  // ownership changed hands. Answer with the implicit yes instead of erroring:
  // a stale shade tap should be a quiet no-op, never a red toast.
  if (isImplicitlyConfirmedOwner(participant)) {
    const ownerRoster = await loadRoster(gameId);
    return {
      attendance: OWNER_IMPLICIT_ANSWER as ParticipantAttendance,
      summary: projectSummary(ownerRoster, userId),
    };
  }

  if (participant.attendance !== answer) {
    await prisma.gameParticipant.update({
      where: { id: participant.id },
      data: buildAnswerUpdate(answer, now),
    });
  }

  const roster = await loadRoster(gameId);
  const summary = projectSummary(roster, userId);
  await emitSummary(gameId, userId, answer as ParticipantAttendance, summary);

  return { attendance: answer as ParticipantAttendance, summary };
}

/**
 * Push / Telegram entry point. Returns `false` instead of throwing so a stale
 * shade action degrades into a quiet no-op rather than a 500.
 */
export async function setAttendanceFromAction(
  userId: string,
  gameId: string,
  answer: AttendanceAnswer,
): Promise<boolean> {
  try {
    await setAttendance(gameId, userId, answer);
    return true;
  } catch (error) {
    if (error instanceof ApiError && error.statusCode < 500) {
      return false;
    }
    console.error('[attendance] Action failed:', error);
    return false;
  }
}

export type NoShowNoteResult = {
  summary: AttendanceSummary;
  noShowNotedAt: string;
};

export async function noteNoShow(
  gameId: string,
  targetUserId: string,
  actorUserId: string,
  now: Date = new Date(),
): Promise<NoShowNoteResult> {
  const game = await loadGameForAttendance(gameId);
  if (!supportsAttendance(game.entityType)) {
    throw new ApiError(400, 'errors.attendance.notSupported');
  }
  if (!isWithinNoShowWindow(game.endTime, now)) {
    throw new ApiError(400, 'errors.attendance.noShowWindowClosed');
  }
  if (targetUserId === actorUserId) {
    throw new ApiError(400, 'errors.attendance.noShowSelf');
  }

  const participant = await prisma.gameParticipant.findFirst({
    where: { gameId, userId: targetUserId },
    select: { id: true, status: true, noShowNotedAt: true },
  });
  if (!participant || participant.status !== 'PLAYING') {
    throw new ApiError(404, 'errors.attendance.participantNotFound');
  }

  const alreadyNoted = participant.noShowNotedAt != null;
  if (!alreadyNoted) {
    await prisma.gameParticipant.update({
      where: { id: participant.id },
      data: buildNoShowNoteUpdate(actorUserId, now),
    });
  }

  const roster = await loadRoster(gameId);
  const summary = projectSummary(roster, actorUserId);
  await emitSummary(gameId, targetUserId, attendanceOf(roster, targetUserId), summary);

  if (!alreadyNoted) {
    await refreshAttendanceCountersForGame(gameId);
    void createSystemMessageWithNotification(
      gameId,
      SystemMessageType.USER_NOTED_NO_SHOW,
      targetUserId,
    );
    void notifyNoShowNoted(gameId, targetUserId);
  }

  const notedAt = participant.noShowNotedAt ?? now;
  return { summary, noShowNotedAt: notedAt.toISOString() };
}

export async function undoNoShow(
  gameId: string,
  targetUserId: string,
  actorUserId: string,
  now: Date = new Date(),
): Promise<{ summary: AttendanceSummary }> {
  const game = await loadGameForAttendance(gameId);
  if (!supportsAttendance(game.entityType)) {
    throw new ApiError(400, 'errors.attendance.notSupported');
  }
  if (!isWithinNoShowWindow(game.endTime, now)) {
    throw new ApiError(400, 'errors.attendance.noShowWindowClosed');
  }

  const participant = await prisma.gameParticipant.findFirst({
    where: { gameId, userId: targetUserId },
    select: { id: true, status: true, noShowNotedAt: true },
  });
  if (!participant) {
    throw new ApiError(404, 'errors.attendance.participantNotFound');
  }

  if (participant.noShowNotedAt) {
    await prisma.gameParticipant.update({
      where: { id: participant.id },
      data: buildNoShowUndoUpdate(),
    });
    await refreshAttendanceCountersForGame(gameId);
  }

  const roster = await loadRoster(gameId);
  const summary = projectSummary(roster, actorUserId);
  await emitSummary(gameId, targetUserId, attendanceOf(roster, targetUserId), summary);
  return { summary };
}

async function notifyNoShowNoted(gameId: string, targetUserId: string): Promise<void> {
  try {
    const payload = await createGameNoShowNotedPushNotification(gameId, targetUserId);
    if (!payload) return;
    await notificationService.sendNotification({
      userId: targetUserId,
      type: NotificationType.GAME_NO_SHOW_NOTED,
      payload,
    });
  } catch (error) {
    console.error(`[attendance] Failed to notify no-show note for game ${gameId}:`, error);
  }
}

/** Reads the cooldown off the last nudge system message — restart-safe, no new table. */
export async function readNudgeCooldown(
  gameId: string,
  now: Date = new Date(),
): Promise<NudgeCooldown> {
  const last = await prisma.chatMessage.findFirst({
    where: {
      contextId: gameId,
      chatContextType: 'GAME',
      senderId: null,
      content: { contains: NUDGE_MESSAGE_MARKER },
    },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  return evaluateNudgeCooldown(last?.createdAt ?? null, now);
}

export type NudgeResult = {
  nudgedUserIds: string[];
  cooldown: NudgeCooldown;
};

/**
 * Sends one reminder push + one chat system message to the players who have not
 * answered. Never touches anyone's seat; players who do not answer keep playing.
 */
export async function nudgeUnanswered(
  gameId: string,
  actorUserId: string,
  now: Date = new Date(),
): Promise<NudgeResult> {
  const game = await loadGameForAttendance(gameId);
  if (!supportsAttendance(game.entityType)) {
    throw new ApiError(400, 'errors.attendance.notSupported');
  }
  if (!gameAcceptsAttendanceAnswers(game, now)) {
    throw new ApiError(400, 'errors.attendance.answersClosed');
  }

  const cooldown = await readNudgeCooldown(gameId, now);
  if (!cooldown.allowed) {
    throw new ApiError(429, 'errors.attendance.nudgeCooldown', true, {
      remainingHours: cooldown.remainingHours,
      nextAllowedAt: cooldown.nextAllowedAt,
    });
  }

  // `role` excludes the owner: their row reads CONFIRMED everywhere, so an
  // admin nudging must not poke the organizer about a question they never got.
  const unanswered = await prisma.gameParticipant.findMany({
    where: { gameId, status: 'PLAYING', attendance: 'UNANSWERED', role: { not: 'OWNER' } },
    select: {
      user: {
        select: { id: true, language: true, currentCityId: true, primarySport: true },
      },
    },
  });

  const recipients = unanswered.map((row) => row.user).filter((user) => user.id !== actorUserId);
  if (recipients.length === 0) {
    throw new ApiError(400, 'errors.attendance.nothingToNudge');
  }

  const hoursBeforeStart = Math.max(
    1,
    Math.round((game.startTime.getTime() - now.getTime()) / (60 * 60 * 1000)),
  );

  // The system message *is* the cooldown record, so it is written before the
  // fan-out: a push failure must not hand the organizer a free second nudge.
  await createSystemMessageWithNotification(
    gameId,
    SystemMessageType.ATTENDANCE_NUDGED,
    actorUserId,
  );

  await notificationService.sendGameReminderNotification(gameId, recipients, hoursBeforeStart, {
    attendanceActions: true,
    onlyUserIds: recipients.map((user) => user.id),
  });

  return {
    nudgedUserIds: recipients.map((user) => user.id),
    cooldown: evaluateNudgeCooldown(now, now),
  };
}

/** Every PLAYING participant's own no-show notes, newest first (own profile only). */
export async function listMyNoShowNotes(
  userId: string,
  limit = 20,
): Promise<
  {
    gameId: string;
    gameName: string | null;
    entityType: EntityType;
    startTime: string;
    clubName: string | null;
    notedAt: string;
  }[]
> {
  const rows = await prisma.gameParticipant.findMany({
    where: { userId, noShowNotedAt: { not: null } },
    orderBy: { noShowNotedAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 50),
    select: {
      noShowNotedAt: true,
      game: {
        select: {
          id: true,
          name: true,
          entityType: true,
          startTime: true,
          club: { select: { name: true } },
          court: { select: { club: { select: { name: true } } } },
        },
      },
    },
  });

  return rows.map((row) => ({
    gameId: row.game.id,
    gameName: row.game.name,
    entityType: row.game.entityType,
    startTime: row.game.startTime.toISOString(),
    clubName: row.game.club?.name ?? row.game.court?.club?.name ?? null,
    notedAt: row.noShowNotedAt!.toISOString(),
  }));
}

/**
 * Post-commit hook for a game reaching FINAL / FINISHED. Safe to call twice —
 * counters are recomputed, not incremented.
 */
export async function onGameFinalizedForAttendance(gameId: string): Promise<void> {
  await refreshAttendanceCountersForGame(gameId);
}

export { refreshAttendanceCounters };

// ---------------------------------------------------------------------------
// Registrations (import-time; this module is imported by gameAttendance.routes)
// ---------------------------------------------------------------------------

registerPushActionHandler('attendance', async (scope) => {
  const answer = ATTENDANCE_ACTION_TO_ANSWER[scope.action];
  if (!answer || !isAttendanceAnswer(answer)) {
    return { success: false, message: 'errors.attendance.invalidState' };
  }
  const ok = await setAttendanceFromAction(scope.userId, scope.targetId, answer);
  if (!ok) {
    return { success: false, message: 'errors.attendance.notParticipant' };
  }
  return {
    success: true,
    message: answer === 'CONFIRMED' ? 'attendance.confirmedToast' : 'attendance.unsureToast',
  };
});

registerAvailableGamesEnricher('attendanceSummary', async (userId, games) => {
  const ids = games.map((game) => game.id);
  if (ids.length === 0) return {};

  const rows = withOwnerImplicitAnswer(
    await prisma.gameParticipant.findMany({
      where: { gameId: { in: ids } },
      select: {
        gameId: true,
        userId: true,
        status: true,
        role: true,
        attendance: true,
        noShowNotedAt: true,
        joinedAt: true,
      },
      orderBy: { joinedAt: 'asc' },
    }),
  );

  const byGame = new Map<string, typeof rows>();
  for (const row of rows) {
    const bucket = byGame.get(row.gameId);
    if (bucket) bucket.push(row);
    else byGame.set(row.gameId, [row]);
  }

  const result: Record<string, { attendanceSummary: AttendanceSummary | null }> = {};
  for (const id of ids) {
    const roster = byGame.get(id) ?? [];
    // The card stack is only for the viewer's own games — never a social signal
    // about strangers.
    const viewerIsPlaying = roster.some(
      (row) => row.userId === userId && row.status === 'PLAYING',
    );
    if (!viewerIsPlaying) {
      result[id] = { attendanceSummary: null };
      continue;
    }
    result[id] = { attendanceSummary: projectSummary(roster, userId) };
  }
  return result;
});
