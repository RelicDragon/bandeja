import { useSyncExternalStore } from 'react';

let activeGameId: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function claimLeagueResultsEngine(gameId: string): void {
  if (activeGameId === gameId) return;
  activeGameId = gameId;
  emit();
}

export function releaseLeagueResultsEngine(gameId: string): void {
  if (activeGameId !== gameId) return;
  activeGameId = null;
  emit();
}

/** Drop any league card claim (e.g. when full results entry takes the singleton). */
export function releaseAnyLeagueResultsEngine(): void {
  if (activeGameId === null) return;
  activeGameId = null;
  emit();
}

export function useLeagueResultsEngineOwner(gameId: string): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange);
      return () => {
        listeners.delete(onStoreChange);
      };
    },
    () => activeGameId === gameId,
    () => false,
  );
}
