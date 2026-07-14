import type { QueryClient } from '@tanstack/react-query';
import i18n from '@/i18n/config';
import { queryKeys } from '@/queries/queryKeys';
import type { MyGamesData } from '@/queries/games/useMyGamesQuery';
import { useAuthStore } from '@/store/authStore';
import {
  buildAuthenticatedNextGamesEnvelope,
  type NextGamesEnvelope,
} from '@/widgets/cachedNextGameDto';
import { clearNextGamesToNative, syncNextGamesToNative } from '@/services/widgetBridge';

let initialized = false;
let unsubscribeCache: (() => void) | null = null;
let unsubscribeLanguage: (() => void) | null = null;
let lastSyncedSignature: string | null = null;
/** Bumped on every clear so in-flight auth writes cannot win after logout. */
let writeGeneration = 0;
let writeChain: Promise<void> = Promise.resolve();
let pendingEnvelope: NextGamesEnvelope | null = null;
let pendingSignature: string | null = null;
let coalesceScheduled = false;

function currentUiLanguage(): string {
  return i18n.resolvedLanguage || i18n.language || 'en';
}

function envelopeSignature(envelope: NextGamesEnvelope): string {
  return JSON.stringify(envelope);
}

function enqueueWrite(task: () => Promise<void>): Promise<void> {
  writeChain = writeChain.then(task, task);
  return writeChain;
}

async function flushPendingAuthenticatedWrite(expectedGeneration: number): Promise<void> {
  const envelope = pendingEnvelope;
  const signature = pendingSignature;
  pendingEnvelope = null;
  pendingSignature = null;

  if (!envelope || !signature) {
    coalesceScheduled = false;
    return;
  }

  if (expectedGeneration !== writeGeneration || !useAuthStore.getState().isAuthenticated) {
    coalesceScheduled = false;
    return;
  }
  if (signature === lastSyncedSignature) {
    if (pendingEnvelope) {
      return flushPendingAuthenticatedWrite(writeGeneration);
    }
    coalesceScheduled = false;
    return;
  }

  const wrote = await syncNextGamesToNative(envelope);
  if (!wrote || expectedGeneration !== writeGeneration || !useAuthStore.getState().isAuthenticated) {
    if (pendingEnvelope && useAuthStore.getState().isAuthenticated && expectedGeneration === writeGeneration) {
      return flushPendingAuthenticatedWrite(expectedGeneration);
    }
    coalesceScheduled = false;
    return;
  }

  lastSyncedSignature = signature;

  if (pendingEnvelope) {
    return flushPendingAuthenticatedWrite(writeGeneration);
  }
  coalesceScheduled = false;
}

export async function syncNextGamesEnvelopeFromMyGames(data: MyGamesData): Promise<void> {
  if (!useAuthStore.getState().isAuthenticated) return;

  const envelope = buildAuthenticatedNextGamesEnvelope(data.games ?? [], currentUiLanguage());
  const signature = envelopeSignature(envelope);
  if (signature === lastSyncedSignature && !pendingEnvelope && !coalesceScheduled) return;

  pendingEnvelope = envelope;
  pendingSignature = signature;
  if (coalesceScheduled) return writeChain;

  coalesceScheduled = true;
  const generation = writeGeneration;
  return enqueueWrite(() => flushPendingAuthenticatedWrite(generation));
}

export async function clearWidgetNextGamesCache(): Promise<void> {
  writeGeneration += 1;
  lastSyncedSignature = null;
  pendingEnvelope = null;
  pendingSignature = null;
  coalesceScheduled = false;
  const generation = writeGeneration;
  return enqueueWrite(async () => {
    if (generation !== writeGeneration) return;
    const cleared = await clearNextGamesToNative();
    if (!cleared && generation === writeGeneration) {
      await clearNextGamesToNative();
    }
  });
}

function isMyGamesQueryKey(queryKey: readonly unknown[]): boolean {
  return queryKey[0] === queryKeys.games.all[0] && queryKey[1] === 'my';
}

function resyncFromCachedMyGames(queryClient: QueryClient): void {
  if (!useAuthStore.getState().isAuthenticated) return;
  const queries = queryClient.getQueryCache().findAll({
    predicate: (query) => isMyGamesQueryKey(query.queryKey),
  });
  for (const query of queries) {
    if (query.state.status !== 'success' || !query.state.data) continue;
    void syncNextGamesEnvelopeFromMyGames(query.state.data as MyGamesData);
    return;
  }
}

export function setupWidgetNextGamesSync(queryClient: QueryClient): void {
  if (initialized) return;
  initialized = true;

  unsubscribeCache = queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated') return;
    if (!useAuthStore.getState().isAuthenticated) return;
    const { query } = event;
    if (!isMyGamesQueryKey(query.queryKey)) return;
    if (query.state.status !== 'success' || !query.state.data) return;
    void syncNextGamesEnvelopeFromMyGames(query.state.data as MyGamesData);
  });

  const onLanguageChanged = () => {
    resyncFromCachedMyGames(queryClient);
  };
  i18n.on('languageChanged', onLanguageChanged);
  unsubscribeLanguage = () => {
    i18n.off('languageChanged', onLanguageChanged);
  };

  resyncFromCachedMyGames(queryClient);
}

export function teardownWidgetNextGamesSync(): void {
  unsubscribeCache?.();
  unsubscribeCache = null;
  unsubscribeLanguage?.();
  unsubscribeLanguage = null;
  lastSyncedSignature = null;
  writeGeneration += 1;
  pendingEnvelope = null;
  pendingSignature = null;
  coalesceScheduled = false;
  writeChain = Promise.resolve();
  initialized = false;
}
