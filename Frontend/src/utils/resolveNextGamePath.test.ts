import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios, { AxiosError } from 'axios';
import type { NextGameCandidate } from './pickNextGame';

type AuthSlice = {
  isAuthenticated: boolean;
  isInitializing: boolean;
  user: { id: string } | null;
};

const authState: AuthSlice = {
  isAuthenticated: true,
  isInitializing: false,
  user: { id: 'user-1' },
};

const authListeners = new Set<(s: AuthSlice) => void>();

function emitAuth() {
  for (const listener of authListeners) {
    listener(authState);
  }
}

const getMyGames = vi.fn();

vi.mock('@/store/authStore', () => ({
  useAuthStore: Object.assign(
    () => authState,
    {
      getState: () => authState,
      subscribe: (listener: (s: AuthSlice) => void) => {
        authListeners.add(listener);
        return () => {
          authListeners.delete(listener);
        };
      },
    },
  ),
}));

vi.mock('@/api/games', () => ({
  gamesApi: {
    getMyGames: (...args: unknown[]) => getMyGames(...args),
  },
}));

import { queryClient } from '@/queries/queryClient';
import { queryKeys } from '@/queries/queryKeys';
import {
  nextGameOpenModeFromSearch,
  resolveNextGamePath,
} from './resolveNextGamePath';

function upcoming(id: string, startTime = '2099-01-15T12:00:00.000Z'): NextGameCandidate {
  return { id, startTime, status: 'ANNOUNCED' };
}

describe('nextGameOpenModeFromSearch', () => {
  it('defaults to detail', () => {
    expect(nextGameOpenModeFromSearch('')).toBe('detail');
    expect(nextGameOpenModeFromSearch('?foo=1')).toBe('detail');
  });

  it('parses chat and live with or without leading ?', () => {
    expect(nextGameOpenModeFromSearch('?open=chat')).toBe('chat');
    expect(nextGameOpenModeFromSearch('open=chat')).toBe('chat');
    expect(nextGameOpenModeFromSearch('?open=live')).toBe('live');
  });
});

describe('resolveNextGamePath', () => {
  beforeEach(() => {
    authState.isAuthenticated = true;
    authState.isInitializing = false;
    authState.user = { id: 'user-1' };
    authListeners.clear();
    getMyGames.mockReset();
    queryClient.clear();
  });

  afterEach(() => {
    queryClient.clear();
    authListeners.clear();
  });

  it('returns /login when unauthenticated', async () => {
    authState.isAuthenticated = false;
    authState.user = null;
    await expect(resolveNextGamePath('detail')).resolves.toBe('/login');
    expect(getMyGames).not.toHaveBeenCalled();
  });

  it('waits until auth isInitializing is false before resolving', async () => {
    authState.isInitializing = true;
    getMyGames.mockResolvedValue({ data: [upcoming('after-init')] });

    let resolved: string | undefined;
    const pending = resolveNextGamePath('detail').then((path) => {
      resolved = path;
    });

    await Promise.resolve();
    expect(resolved).toBeUndefined();
    expect(getMyGames).not.toHaveBeenCalled();

    authState.isInitializing = false;
    emitAuth();
    await expect(pending).resolves.toBeUndefined();
    expect(resolved).toBe('/games/after-init');
    expect(getMyGames).toHaveBeenCalledTimes(1);
  });

  it('uses cached my-games without API when present', async () => {
    queryClient.setQueryData(queryKeys.games.my('user-1'), {
      games: [upcoming('cached-1')],
    });
    await expect(resolveNextGamePath('detail')).resolves.toBe('/games/cached-1');
    await expect(resolveNextGamePath('chat')).resolves.toBe('/games/cached-1/chat');
    await expect(resolveNextGamePath('live')).resolves.toBe('/games/cached-1/live');
    expect(getMyGames).not.toHaveBeenCalled();
  });

  it('fetches my-games when cache miss and maps modes', async () => {
    getMyGames.mockResolvedValue({ data: [upcoming('api-1')] });
    await expect(resolveNextGamePath('detail')).resolves.toBe('/games/api-1');
    getMyGames.mockResolvedValue({ data: [upcoming('api-2')] });
    await expect(resolveNextGamePath('chat')).resolves.toBe('/games/api-2/chat');
    getMyGames.mockResolvedValue({ data: [upcoming('api-3')] });
    await expect(resolveNextGamePath('live')).resolves.toBe('/games/api-3/live');
    expect(getMyGames).toHaveBeenCalledTimes(3);
  });

  it('returns / when authenticated with no displayable next game', async () => {
    getMyGames.mockResolvedValue({ data: [] });
    await expect(resolveNextGamePath('detail')).resolves.toBe('/');
  });

  it('returns /login on 401 from API', async () => {
    const error = new AxiosError('unauthorized');
    error.response = {
      status: 401,
      data: {},
      statusText: 'Unauthorized',
      headers: {},
      config: { headers: new axios.AxiosHeaders() },
    };
    getMyGames.mockRejectedValue(error);
    await expect(resolveNextGamePath('detail')).resolves.toBe('/login');
  });

  it('returns / on non-401 API failure', async () => {
    getMyGames.mockRejectedValue(new Error('network'));
    await expect(resolveNextGamePath('detail')).resolves.toBe('/');
  });

  it('dedupes concurrent callers for the same mode', async () => {
    let resolveFetch!: (value: { data: NextGameCandidate[] }) => void;
    getMyGames.mockImplementation(
      () =>
        new Promise<{ data: NextGameCandidate[] }>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const first = resolveNextGamePath('detail');
    const second = resolveNextGamePath('detail');
    expect(first).toBe(second);
    await vi.waitFor(() => expect(getMyGames).toHaveBeenCalledTimes(1));

    resolveFetch({ data: [upcoming('shared')] });
    await expect(first).resolves.toBe('/games/shared');
    await expect(second).resolves.toBe('/games/shared');
  });

  it('does not share in-flight promises across modes', async () => {
    let detailResolve!: (value: { data: NextGameCandidate[] }) => void;
    let chatResolve!: (value: { data: NextGameCandidate[] }) => void;
    let call = 0;
    getMyGames.mockImplementation(
      () =>
        new Promise<{ data: NextGameCandidate[] }>((resolve) => {
          call += 1;
          if (call === 1) detailResolve = resolve;
          else chatResolve = resolve;
        }),
    );

    const detail = resolveNextGamePath('detail');
    const chat = resolveNextGamePath('chat');
    expect(detail).not.toBe(chat);
    await vi.waitFor(() => expect(getMyGames).toHaveBeenCalledTimes(2));

    detailResolve({ data: [upcoming('d1')] });
    chatResolve({ data: [upcoming('c1')] });
    await expect(detail).resolves.toBe('/games/d1');
    await expect(chat).resolves.toBe('/games/c1/chat');
  });
});
