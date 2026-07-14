import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { MyGamesData } from '@/queries/games/useMyGamesQuery';
import { queryKeys } from '@/queries/queryKeys';

const syncNextGamesToNative = vi.fn(async () => true);
const clearNextGamesToNative = vi.fn(async () => true);

vi.mock('@/services/widgetBridge', () => ({
  syncNextGamesToNative: (...args: unknown[]) => syncNextGamesToNative(...args),
  clearNextGamesToNative: (...args: unknown[]) => clearNextGamesToNative(...args),
}));

vi.mock('@/i18n/config', () => {
  const handlers = new Map<string, Set<(lng: string) => void>>();
  return {
    default: {
      language: 'en',
      resolvedLanguage: 'en',
      on(event: string, cb: (lng: string) => void) {
        if (!handlers.has(event)) handlers.set(event, new Set());
        handlers.get(event)!.add(cb);
      },
      off(event: string, cb: (lng: string) => void) {
        handlers.get(event)?.delete(cb);
      },
      changeLanguage(lng: string) {
        (this as { language: string; resolvedLanguage: string }).language = lng;
        (this as { language: string; resolvedLanguage: string }).resolvedLanguage = lng;
        handlers.get('languageChanged')?.forEach((cb) => cb(lng));
      },
    },
  };
});

const authState = { isAuthenticated: true };

vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => authState,
  },
}));

import i18n from '@/i18n/config';
import {
  clearWidgetNextGamesCache,
  setupWidgetNextGamesSync,
  syncNextGamesEnvelopeFromMyGames,
  teardownWidgetNextGamesSync,
} from './widgetNextGamesSync';

function myGamesData(overrides?: Partial<MyGamesData['games'][number]>): MyGamesData {
  return {
    games: [
      {
        id: 'game-1',
        entityType: 'GAME',
        gameType: 'MATCH',
        name: 'Next',
        city: { id: 'c1', name: 'City', timezone: 'UTC' },
        startTime: '2026-07-14T10:00:00.000Z',
        endTime: '2026-07-14T11:00:00.000Z',
        maxParticipants: 4,
        minParticipants: 2,
        isPublic: true,
        affectsRating: true,
        allowDirectJoin: true,
        status: 'SCHEDULED',
        resultsStatus: 'NONE',
        participants: [{ status: 'PLAYING' }],
        ...overrides,
      } as MyGamesData['games'][number],
    ],
    invites: [],
    unreadCounts: {},
  };
}

describe('widgetNextGamesSync', () => {
  beforeEach(() => {
    authState.isAuthenticated = true;
    syncNextGamesToNative.mockReset();
    clearNextGamesToNative.mockReset();
    syncNextGamesToNative.mockResolvedValue(true);
    clearNextGamesToNative.mockResolvedValue(true);
    teardownWidgetNextGamesSync();
  });

  afterEach(() => {
    teardownWidgetNextGamesSync();
  });

  it('syncs mapped envelope from my games data', async () => {
    await syncNextGamesEnvelopeFromMyGames(myGamesData());
    expect(syncNextGamesToNative).toHaveBeenCalledWith(
      expect.objectContaining({
        isAuthenticated: true,
        language: 'en',
        games: [
          expect.objectContaining({
            id: 'game-1',
            title: 'Next',
            participantCount: 1,
          }),
        ],
      }),
    );
  });

  it('skips sync when signed out', async () => {
    authState.isAuthenticated = false;
    await syncNextGamesEnvelopeFromMyGames(myGamesData());
    expect(syncNextGamesToNative).not.toHaveBeenCalled();
  });

  it('dedupes identical sync payloads', async () => {
    const data = myGamesData();
    await syncNextGamesEnvelopeFromMyGames(data);
    await syncNextGamesEnvelopeFromMyGames(data);
    expect(syncNextGamesToNative).toHaveBeenCalledTimes(1);
  });

  it('coalesces rapid distinct updates into one native write of the latest', async () => {
    let release!: () => void;
    syncNextGamesToNative.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          release = () => resolve(true);
        }),
    );

    const first = syncNextGamesEnvelopeFromMyGames(myGamesData({ name: 'A' }));
    await vi.waitFor(() => expect(syncNextGamesToNative).toHaveBeenCalledTimes(1));
    void syncNextGamesEnvelopeFromMyGames(myGamesData({ name: 'B' }));
    void syncNextGamesEnvelopeFromMyGames(myGamesData({ name: 'C' }));
    release();
    await first;

    expect(syncNextGamesToNative).toHaveBeenCalledTimes(2);
    expect(syncNextGamesToNative.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ games: [expect.objectContaining({ title: 'A' })] }),
    );
    expect(syncNextGamesToNative.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ games: [expect.objectContaining({ title: 'C' })] }),
    );
  });

  it('does not mark signature when native sync fails', async () => {
    syncNextGamesToNative.mockResolvedValueOnce(false);
    await syncNextGamesEnvelopeFromMyGames(myGamesData());
    syncNextGamesToNative.mockResolvedValueOnce(true);
    await syncNextGamesEnvelopeFromMyGames(myGamesData());
    expect(syncNextGamesToNative).toHaveBeenCalledTimes(2);
  });

  it('clear wins over in-flight sync', async () => {
    let releaseSync!: () => void;
    syncNextGamesToNative.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          releaseSync = () => resolve(true);
        }),
    );

    const syncPromise = syncNextGamesEnvelopeFromMyGames(myGamesData());
    await vi.waitFor(() => expect(syncNextGamesToNative).toHaveBeenCalledTimes(1));
    authState.isAuthenticated = false;
    const clearPromise = clearWidgetNextGamesCache();
    releaseSync();
    await Promise.all([syncPromise, clearPromise]);

    expect(clearNextGamesToNative).toHaveBeenCalledTimes(1);
    expect(clearNextGamesToNative.mock.invocationCallOrder[0]).toBeGreaterThan(
      syncNextGamesToNative.mock.invocationCallOrder[0],
    );
  });

  it('retries clear once when native clear fails', async () => {
    clearNextGamesToNative
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    await clearWidgetNextGamesCache();
    expect(clearNextGamesToNative).toHaveBeenCalledTimes(2);
  });

  it('clears native envelope on logout helper', async () => {
    await clearWidgetNextGamesCache();
    expect(clearNextGamesToNative).toHaveBeenCalledTimes(1);
  });

  it('hooks query cache success into native sync', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    setupWidgetNextGamesSync(client);
    client.setQueryData(queryKeys.games.my('user-1'), myGamesData());
    await vi.waitFor(() => {
      expect(syncNextGamesToNative).toHaveBeenCalled();
    });
  });

  it('hydrates native cache from already-present my games on setup', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(queryKeys.games.my('user-1'), myGamesData({ name: 'Cached' }));
    setupWidgetNextGamesSync(client);
    await vi.waitFor(() => {
      expect(syncNextGamesToNative).toHaveBeenCalledWith(
        expect.objectContaining({
          games: [expect.objectContaining({ title: 'Cached' })],
        }),
      );
    });
  });

  it('does not re-sync from query cache after logout', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    setupWidgetNextGamesSync(client);
    client.setQueryData(queryKeys.games.my('user-1'), myGamesData());
    await vi.waitFor(() => expect(syncNextGamesToNative).toHaveBeenCalledTimes(1));
    syncNextGamesToNative.mockClear();
    authState.isAuthenticated = false;
    client.setQueryData(queryKeys.games.my('user-1'), myGamesData());
    await Promise.resolve();
    expect(syncNextGamesToNative).not.toHaveBeenCalled();
  });

  it('resyncs when language changes and my games is cached', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    setupWidgetNextGamesSync(client);
    client.setQueryData(queryKeys.games.my('user-1'), myGamesData());
    await vi.waitFor(() => expect(syncNextGamesToNative).toHaveBeenCalledTimes(1));
    syncNextGamesToNative.mockClear();
    i18n.changeLanguage('es');
    await vi.waitFor(() => {
      expect(syncNextGamesToNative).toHaveBeenCalledWith(
        expect.objectContaining({ language: 'es' }),
      );
    });
  });
});
