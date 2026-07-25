import { afterEach, describe, expect, it, vi } from 'vitest';
import { readMyGamesViewMode, writeMyGamesViewMode } from './myGamesViewStorage';

const LEGACY_KEY = 'padelpulse-my-games-view';

function stubStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  });
  return store;
}

describe('myGamesViewStorage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to calendar', () => {
    stubStorage();
    expect(readMyGamesViewMode('u1')).toBe('calendar');
  });

  it('stores and restores per user', () => {
    stubStorage();
    writeMyGamesViewMode('list', 'u1');
    writeMyGamesViewMode('calendar', 'u2');
    expect(readMyGamesViewMode('u1')).toBe('list');
    expect(readMyGamesViewMode('u2')).toBe('calendar');
  });

  it('does not write shared legacy key when user id is present', () => {
    const store = stubStorage();
    writeMyGamesViewMode('list', 'u1');
    expect(store.get(`${LEGACY_KEY}:u1`)).toBe('list');
    expect(store.has(LEGACY_KEY)).toBe(false);
  });

  it('migrates legacy once then clears it so next user is not contaminated', () => {
    const store = stubStorage({ [LEGACY_KEY]: 'list' });
    expect(readMyGamesViewMode('u1')).toBe('list');
    expect(store.get(`${LEGACY_KEY}:u1`)).toBe('list');
    expect(store.has(LEGACY_KEY)).toBe(false);
    expect(readMyGamesViewMode('u2')).toBe('calendar');
  });

  it('keeps users isolated', () => {
    stubStorage();
    writeMyGamesViewMode('list', 'u1');
    writeMyGamesViewMode('calendar', 'u2');
    expect(readMyGamesViewMode('u1')).toBe('list');
    expect(readMyGamesViewMode('u2')).toBe('calendar');
  });
});
