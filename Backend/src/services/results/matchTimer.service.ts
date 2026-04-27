import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { MatchTimerStatus, Prisma } from '@prisma/client';
import { isGameMatchTimerEnabled } from '../../utils/scoring/matchTimerGame';
import { NotificationChannelType } from '@prisma/client';
import { canModifyResults } from '../../utils/parentGamePermissions';
import { matchTimerCoordinator } from './matchTimerCoordinator';
import type { MatchTimerAction, MatchTimerSnapshotJson } from './matchTimer.types';
import { createMatchTimerCapPushNotification } from '../push/notifications/match-timer-cap-push.notification';
import pushNotificationService from '../push/push-notification.service';
import { NotificationPreferenceService, PreferenceKey } from '../notificationPreference.service';

const timerSelect = {
  id: true,
  timerStatus: true,
  timerStartedAt: true,
  timerPausedAt: true,
  timerElapsedMs: true,
  timerCapMinutes: true,
  timerExpiryNotifiedAt: true,
} as const;

type TimerRow = Prisma.MatchGetPayload<{ select: typeof timerSelect }>;

export function computeMatchElapsedMs(m: TimerRow, now: Date): number {
  let ms = m.timerElapsedMs;
  if (m.timerStatus === MatchTimerStatus.RUNNING && m.timerStartedAt) {
    ms += now.getTime() - m.timerStartedAt.getTime();
  }
  return Math.max(0, ms);
}

export function buildMatchTimerSnapshot(
  m: TimerRow,
  now: Date,
  extra?: { capJustNotified?: boolean }
): MatchTimerSnapshotJson {
  const elapsed = computeMatchElapsedMs(m, now);
  const capMs =
    m.timerCapMinutes != null && m.timerCapMinutes > 0 ? m.timerCapMinutes * 60_000 : 0;
  const remaining =
    capMs > 0 && m.timerStatus === MatchTimerStatus.RUNNING ? Math.max(0, capMs - elapsed) : null;
  return {
    status: m.timerStatus,
    startedAt: m.timerStartedAt?.toISOString() ?? null,
    pausedAt: m.timerPausedAt?.toISOString() ?? null,
    elapsedMs: elapsed,
    capMinutes: m.timerCapMinutes,
    serverNow: now.toISOString(),
    expiresAt:
      remaining != null && m.timerStatus === MatchTimerStatus.RUNNING
        ? new Date(now.getTime() + remaining).toISOString()
        : null,
    capJustNotified: extra?.capJustNotified,
  };
}

function emitMatchTimerSocket(gameId: string, matchId: string, snapshot: MatchTimerSnapshotJson) {
  const socket = (global as any).socketService as
    | { emitMatchTimerUpdated: (g: string, m: string, s: MatchTimerSnapshotJson) => void }
    | undefined;
  socket?.emitMatchTimerUpdated(gameId, matchId, snapshot);
}

async function assertTimedResultsGame(gameId: string) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      status: true,
      resultsStatus: true,
      scoringPreset: true,
      matchTimedCapMinutes: true,
      matchTimerEnabled: true,
    },
  });
  if (!game) throw new ApiError(404, 'Game not found');
  if (game.status === 'ARCHIVED') throw new ApiError(400, 'Game is archived');
  if (game.resultsStatus !== 'IN_PROGRESS') {
    throw new ApiError(400, 'Match timer is only available while results are in progress');
  }
  if (!isGameMatchTimerEnabled(game)) {
    throw new ApiError(400, 'Match timer is only available for timed scoring formats');
  }
  if (!game.matchTimedCapMinutes || game.matchTimedCapMinutes < 1) {
    throw new ApiError(400, 'Match time cap is not configured for this game');
  }
  return game;
}

function scheduleCapCheck(matchId: string, gameId: string) {
  void (async () => {
    try {
      const row = await prisma.match.findUnique({
        where: { id: matchId },
        select: { ...timerSelect, round: { select: { gameId: true } } },
      });
      if (!row || row.round.gameId !== gameId || row.timerStatus !== MatchTimerStatus.RUNNING) return;
      if (!row.timerCapMinutes || row.timerCapMinutes < 1) return;
      const now = new Date();
      const elapsed = computeMatchElapsedMs(row, now);
      const capMs = row.timerCapMinutes * 60_000;
      const remaining = capMs - elapsed;
      if (remaining <= 0) {
        await handleCapReached(matchId, gameId);
        return;
      }
      matchTimerCoordinator.schedule(matchId, remaining, () => {
        void handleCapReached(matchId, gameId);
      });
    } catch (e) {
      console.error('[MatchTimer] scheduleCapCheck', e);
    }
  })();
}

async function handleCapReached(matchId: string, gameId: string) {
  try {
    const row = await prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        timerStatus: true,
        timerStartedAt: true,
        timerPausedAt: true,
        timerElapsedMs: true,
        timerCapMinutes: true,
        timerExpiryNotifiedAt: true,
        round: { select: { gameId: true } },
        teams: {
          include: {
            players: { select: { userId: true } },
          },
        },
      },
    });
    if (!row || row.round.gameId !== gameId) return;
    if (row.timerStatus !== MatchTimerStatus.RUNNING) return;
    const now = new Date();
    const elapsed = computeMatchElapsedMs(row, now);
    const capMs = (row.timerCapMinutes ?? 0) * 60_000;
    if (capMs < 1 || elapsed < capMs) {
      scheduleCapCheck(matchId, gameId);
      return;
    }
    if (row.timerExpiryNotifiedAt) return;

    await prisma.match.update({
      where: { id: matchId },
      data: { timerExpiryNotifiedAt: now },
    });

    const fresh = await prisma.match.findUnique({
      where: { id: matchId },
      select: timerSelect,
    });
    if (!fresh) return;

    const snapshot = buildMatchTimerSnapshot(fresh, new Date(), { capJustNotified: true });
    emitMatchTimerSocket(gameId, matchId, snapshot);

    const userIds = new Set<string>();
    for (const t of row.teams) {
      for (const p of t.players) userIds.add(p.userId);
    }

    for (const uid of userIds) {
      const allowPush = await NotificationPreferenceService.doesUserAllow(
        uid,
        NotificationChannelType.PUSH,
        PreferenceKey.SEND_REMINDERS
      );
      if (!allowPush) continue;
      const payload = await createMatchTimerCapPushNotification(gameId, matchId, uid);
      if (payload) {
        await pushNotificationService.sendNotificationToUser(uid, payload);
      }
    }
  } catch (e) {
    console.error('[MatchTimer] handleCapReached', e);
  }
}

export async function resetMatchTimersInGameTx(tx: Prisma.TransactionClient, gameId: string) {
  await tx.match.updateMany({
    where: { round: { gameId } },
    data: {
      timerStatus: MatchTimerStatus.IDLE,
      timerStartedAt: null,
      timerPausedAt: null,
      timerElapsedMs: 0,
      timerCapMinutes: null,
      timerExpiryNotifiedAt: null,
      timerUpdatedBy: null,
      timerUpdatedAt: null,
    },
  });
}

export async function cancelAllMatchTimersForGame(gameId: string) {
  const ids = await prisma.match.findMany({
    where: { round: { gameId } },
    select: { id: true },
  });
  for (const { id } of ids) matchTimerCoordinator.cancel(id);
}

export async function resumeMatchTimerSchedulesOnStartup() {
  const rows = await prisma.match.findMany({
    where: { timerStatus: MatchTimerStatus.RUNNING },
    select: { id: true, round: { select: { gameId: true } } },
  });
  for (const r of rows) {
    scheduleCapCheck(r.id, r.round.gameId);
  }
}

export async function getMatchTimerSnapshotForApi(
  gameId: string,
  matchId: string
): Promise<MatchTimerSnapshotJson> {
  const match = await prisma.match.findFirst({
    where: { id: matchId, round: { gameId } },
    select: timerSelect,
  });
  if (!match) throw new ApiError(404, 'Match not found');
  return buildMatchTimerSnapshot(match, new Date());
}

export async function transitionMatchTimer(
  gameId: string,
  matchId: string,
  userId: string,
  isAdmin: boolean,
  action: MatchTimerAction
): Promise<MatchTimerSnapshotJson> {
  await canModifyResults(gameId, userId, isAdmin);
  const game = await assertTimedResultsGame(gameId);
  const now = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const match = await tx.match.findFirst({
      where: { id: matchId, round: { gameId } },
      select: {
        id: true,
        timerStatus: true,
        timerStartedAt: true,
        timerPausedAt: true,
        timerElapsedMs: true,
        timerCapMinutes: true,
        timerExpiryNotifiedAt: true,
      },
    });
    if (!match) throw new ApiError(404, 'Match not found');

    let data: Prisma.MatchUpdateInput = {
      timerUpdatedBy: userId,
      timerUpdatedAt: now,
    };

    switch (action) {
      case 'start': {
        if (match.timerStatus !== MatchTimerStatus.IDLE && match.timerStatus !== MatchTimerStatus.STOPPED) {
          throw new ApiError(409, 'Timer can only start from idle or stopped');
        }
        data = {
          ...data,
          timerStatus: MatchTimerStatus.RUNNING,
          timerStartedAt: now,
          timerPausedAt: null,
          timerElapsedMs: 0,
          timerCapMinutes: game.matchTimedCapMinutes,
          timerExpiryNotifiedAt: null,
        };
        break;
      }
      case 'pause': {
        if (match.timerStatus !== MatchTimerStatus.RUNNING || !match.timerStartedAt) {
          throw new ApiError(409, 'Timer is not running');
        }
        const slice = now.getTime() - match.timerStartedAt.getTime();
        data = {
          ...data,
          timerStatus: MatchTimerStatus.PAUSED,
          timerStartedAt: null,
          timerPausedAt: now,
          timerElapsedMs: match.timerElapsedMs + Math.max(0, slice),
        };
        break;
      }
      case 'resume': {
        if (match.timerStatus !== MatchTimerStatus.PAUSED) {
          throw new ApiError(409, 'Timer is not paused');
        }
        data = {
          ...data,
          timerStatus: MatchTimerStatus.RUNNING,
          timerStartedAt: now,
          timerPausedAt: null,
        };
        break;
      }
      case 'stop': {
        if (match.timerStatus === MatchTimerStatus.IDLE) {
          throw new ApiError(409, 'Timer is already idle');
        }
        let elapsed = match.timerElapsedMs;
        if (match.timerStatus === MatchTimerStatus.RUNNING && match.timerStartedAt) {
          elapsed += now.getTime() - match.timerStartedAt.getTime();
        }
        data = {
          ...data,
          timerStatus: MatchTimerStatus.STOPPED,
          timerStartedAt: null,
          timerPausedAt: null,
          timerElapsedMs: Math.max(0, elapsed),
        };
        break;
      }
      case 'reset': {
        data = {
          ...data,
          timerStatus: MatchTimerStatus.IDLE,
          timerStartedAt: null,
          timerPausedAt: null,
          timerElapsedMs: 0,
          timerCapMinutes: null,
          timerExpiryNotifiedAt: null,
        };
        break;
      }
      default:
        throw new ApiError(400, 'Invalid timer action');
    }

    return tx.match.update({
      where: { id: matchId },
      data,
      select: timerSelect,
    });
  });

  matchTimerCoordinator.cancel(matchId);
  if (updated.timerStatus === MatchTimerStatus.RUNNING) {
    scheduleCapCheck(matchId, gameId);
  }

  const snap = buildMatchTimerSnapshot(updated, new Date());
  emitMatchTimerSocket(gameId, matchId, snap);
  return snap;
}
