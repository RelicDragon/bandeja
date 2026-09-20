import type { ParticipantAttendance } from '@prisma/client';
import type {
  SpotOpenedCause,
  WeatherRiskSeverity,
} from './game/availableGamesEnrichmentTypes';

type BetEventPayload = { gameId: string; bet: unknown };
type BetDeletedPayload = { gameId: string; betId: string };
type BetResolvedSocialPayload = {
  gameId: string;
  betId: string;
  winnerId: string;
  loserId: string;
};
type BetResolvedPoolPayload = {
  gameId: string;
  betId: string;
  winnerIds: string[];
  sharePerWinner: number;
  winnerShares: Record<string, number>;
};

/** PRD 346 — `game-attendance-updated`. */
export type GameAttendanceUpdatedPayload = {
  userId: string;
  attendance: ParticipantAttendance;
  confirmedCount: number;
  playingCount: number;
};

/** PRD 347 — `game-seat-opened`. */
export type GameSeatOpenedPayload = {
  freedCount: number;
  cause: SpotOpenedCause;
  /** ISO timestamp; equal to `Game.lastSeatOpenedAt` after the event. */
  lastSeatOpenedAt: string;
};

/** PRD 345 — `game-series-confirmations-updated`. */
export type GameSeriesConfirmationsUpdatedPayload = {
  seriesId: string;
  confirmedCount: number;
  regularCount: number;
};

export interface SocketEmitBackend {
  emit(eventName: string, data: unknown): Promise<void>;
  emitGameUpdate(
    gameId: string,
    senderId: string,
    game?: unknown,
    forceUpdate?: boolean
  ): Promise<void>;
  emitGameAttendanceUpdated(gameId: string, payload: GameAttendanceUpdatedPayload): void;
  emitGameSeatOpened(gameId: string, payload: GameSeatOpenedPayload): void;
  emitGameSeatFilled(gameId: string, payload: { userId: string }): void;
  emitGameCostUpdated(gameId: string): void;
  emitGameSeriesConfirmationsUpdated(
    gameId: string,
    payload: GameSeriesConfirmationsUpdatedPayload
  ): void;
  emitGameWeatherAlertUpdated(
    gameId: string,
    payload: { severity: WeatherRiskSeverity }
  ): void;
}

let backend: SocketEmitBackend | null = null;

export function initSocketEmitFacade(socketService: SocketEmitBackend): void {
  backend = socketService;
}

export function resetSocketEmitFacadeForTests(): void {
  backend = null;
}

async function safeEmit(label: string, fn: () => Promise<void>): Promise<void> {
  if (!backend) return;
  try {
    await fn();
  } catch (error) {
    console.error(`Failed to emit ${label}:`, error);
  }
}

export async function emitBetCreated(gameId: string, bet: unknown): Promise<void> {
  await safeEmit('bet created event', () =>
    backend!.emit('bet:created', { gameId, bet } satisfies BetEventPayload)
  );
}

export async function emitBetUpdated(gameId: string, bet: unknown): Promise<void> {
  await safeEmit('bet updated event', () =>
    backend!.emit('bet:updated', { gameId, bet } satisfies BetEventPayload)
  );
}

export async function emitBetDeleted(gameId: string, betId: string): Promise<void> {
  await safeEmit('bet deleted event', () =>
    backend!.emit('bet:deleted', { gameId, betId } satisfies BetDeletedPayload)
  );
}

export async function emitBetResolvedSocial(
  gameId: string,
  betId: string,
  winnerId: string,
  loserId: string
): Promise<void> {
  await safeEmit('bet resolved event', () =>
    backend!.emit('bet:resolved', {
      gameId,
      betId,
      winnerId,
      loserId,
    } satisfies BetResolvedSocialPayload)
  );
}

export async function emitBetResolvedPool(
  gameId: string,
  betId: string,
  winnerIds: string[],
  sharePerWinner: number,
  winnerShares: Record<string, number>
): Promise<void> {
  await safeEmit('bet resolved event', () =>
    backend!.emit('bet:resolved', {
      gameId,
      betId,
      winnerIds,
      sharePerWinner,
      winnerShares,
    } satisfies BetResolvedPoolPayload)
  );
}

export async function emitGameUpdate(
  gameId: string,
  senderId: string,
  game?: unknown,
  forceUpdate = false
): Promise<void> {
  await safeEmit('game update event', () =>
    backend!.emitGameUpdate(gameId, senderId, game, forceUpdate)
  );
}

/* -------------------------------------------------------------------------- */
/* PRDs 345–357 game-room events (CONTRACT §6).                               */
/* No-ops before `initSocketEmitFacade` runs (scripts, tests, workers) and     */
/* never throw into the caller's transaction.                                  */
/* -------------------------------------------------------------------------- */

/** PRD 346 — a participant answered the attendance prompt. */
export async function emitGameAttendanceUpdated(
  gameId: string,
  payload: GameAttendanceUpdatedPayload
): Promise<void> {
  await safeEmit('game attendance updated event', async () => {
    backend!.emitGameAttendanceUpdated(gameId, payload);
  });
}

/** PRD 347 — one or more PLAYING seats were freed. */
export async function emitGameSeatOpened(
  gameId: string,
  payload: GameSeatOpenedPayload
): Promise<void> {
  await safeEmit('game seat opened event', async () => {
    backend!.emitGameSeatOpened(gameId, payload);
  });
}

/** PRD 347 — a freed seat was taken. */
export async function emitGameSeatFilled(
  gameId: string,
  payload: { userId: string }
): Promise<void> {
  await safeEmit('game seat filled event', async () => {
    backend!.emitGameSeatFilled(gameId, payload);
  });
}

/** PRD 348 — the cost split changed; clients refetch the Cost card. */
export async function emitGameCostUpdated(gameId: string): Promise<void> {
  await safeEmit('game cost updated event', async () => {
    backend!.emitGameCostUpdated(gameId);
  });
}

/** PRD 345 — a regular answered the "same time next week?" prompt. */
export async function emitGameSeriesConfirmationsUpdated(
  gameId: string,
  payload: GameSeriesConfirmationsUpdatedPayload
): Promise<void> {
  await safeEmit('game series confirmations updated event', async () => {
    backend!.emitGameSeriesConfirmationsUpdated(gameId, payload);
  });
}

/** PRD 357 — the weather alert severity for this game changed. */
export async function emitGameWeatherAlertUpdated(
  gameId: string,
  payload: { severity: WeatherRiskSeverity }
): Promise<void> {
  await safeEmit('game weather alert updated event', async () => {
    backend!.emitGameWeatherAlertUpdated(gameId, payload);
  });
}
