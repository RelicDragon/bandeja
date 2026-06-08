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

export interface SocketEmitBackend {
  emit(eventName: string, data: unknown): Promise<void>;
  emitGameUpdate(
    gameId: string,
    senderId: string,
    game?: unknown,
    forceUpdate?: boolean
  ): Promise<void>;
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
