import { socketService } from '@/services/socketService';

const refCounts = new Map<string, number>();
/** Monotonic epoch so a late join after release cannot leave the socket stuck. */
const joinEpoch = new Map<string, number>();
let reconnectUnsub: (() => void) | null = null;
const reconnectListeners = new Set<() => void>();

function ensureReconnectHook(): void {
  if (reconnectUnsub) return;
  reconnectUnsub = socketService.onConnect(() => {
    void rejoinRetainedGameRooms();
    for (const listener of reconnectListeners) {
      try {
        listener();
      } catch {
        /* ignore listener errors */
      }
    }
  });
}

async function rejoinRetainedGameRooms(): Promise<void> {
  const ids = [...refCounts.entries()].filter(([, count]) => count > 0).map(([id]) => id);
  for (const gameId of ids) {
    const epoch = (joinEpoch.get(gameId) ?? 0) + 1;
    joinEpoch.set(gameId, epoch);
    try {
      await socketService.joinGameRoom(gameId);
    } catch {
      /* will retry on next connect */
    }
  }
}

/** Ref-counted join so schedule + game details + live board can share one room. */
export async function retainGameRoom(gameId: string): Promise<void> {
  ensureReconnectHook();
  const next = (refCounts.get(gameId) ?? 0) + 1;
  refCounts.set(gameId, next);
  if (next !== 1) return;

  const epoch = (joinEpoch.get(gameId) ?? 0) + 1;
  joinEpoch.set(gameId, epoch);

  try {
    await socketService.joinGameRoom(gameId);
  } catch (error) {
    if (joinEpoch.get(gameId) !== epoch) return;
    const current = refCounts.get(gameId) ?? 0;
    if (current <= 1) {
      refCounts.delete(gameId);
    } else {
      refCounts.set(gameId, current - 1);
    }
    throw error;
  }

  if (joinEpoch.get(gameId) !== epoch || (refCounts.get(gameId) ?? 0) === 0) {
    socketService.leaveGameRoom(gameId);
  }
}

export function releaseGameRoom(gameId: string): void {
  const current = refCounts.get(gameId) ?? 0;
  if (current <= 1) {
    refCounts.delete(gameId);
    joinEpoch.set(gameId, (joinEpoch.get(gameId) ?? 0) + 1);
    socketService.leaveGameRoom(gameId);
    return;
  }
  refCounts.set(gameId, current - 1);
}

/** Notify when socket reconnects so live caches can refetch retained fixtures. */
export function onGameRoomsReconnected(listener: () => void): () => void {
  ensureReconnectHook();
  reconnectListeners.add(listener);
  return () => {
    reconnectListeners.delete(listener);
  };
}

/** Test helper. */
export function __gameRoomRefCountForTests(gameId: string): number {
  return refCounts.get(gameId) ?? 0;
}

export function __resetGameRoomMembershipForTests(): void {
  refCounts.clear();
  joinEpoch.clear();
  reconnectListeners.clear();
  reconnectUnsub?.();
  reconnectUnsub = null;
}
