import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const memory = new Map<string, string>();
  const sessionStorage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
    clear: () => memory.clear(),
  };
  Object.defineProperty(globalThis, 'sessionStorage', { value: sessionStorage, configurable: true });
});

import { useBrowseCityStore } from './browseCityStore';

describe('browseCityStore', () => {
  beforeEach(() => {
    sessionStorage.clear();
    useBrowseCityStore.setState({ cityId: null, recents: [], snapshots: {} });
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('stores browse city and recents without duplicating home', () => {
    useBrowseCityStore.getState().setCityId('brno', { name: 'Brno', country: 'CZ' }, 'prague');
    useBrowseCityStore.getState().setCityId('kladno', { name: 'Kladno', country: 'CZ' }, 'prague');
    useBrowseCityStore.getState().setCityId('brno', { name: 'Brno', country: 'CZ' }, 'prague');

    expect(useBrowseCityStore.getState().cityId).toBe('brno');
    expect(useBrowseCityStore.getState().recents).toEqual(['brno', 'kladno']);
    expect(useBrowseCityStore.getState().snapshots.brno.name).toBe('Brno');
  });

  it('treats home as the default lens and keeps recents', () => {
    useBrowseCityStore.getState().setCityId('brno', { name: 'Brno', country: 'CZ' }, 'prague');
    useBrowseCityStore.getState().setCityId('prague', { name: 'Prague', country: 'CZ' }, 'prague');
    expect(useBrowseCityStore.getState().cityId).toBeNull();
    expect(useBrowseCityStore.getState().recents).toEqual(['brno']);
  });

  it('resetToHome clears the lens but keeps recents', () => {
    useBrowseCityStore.getState().setCityId('brno', { name: 'Brno', country: 'CZ' });
    useBrowseCityStore.getState().resetToHome();
    expect(useBrowseCityStore.getState().cityId).toBeNull();
    expect(useBrowseCityStore.getState().recents).toEqual(['brno']);
    expect(useBrowseCityStore.getState().snapshots.brno.name).toBe('Brno');
  });

  it('resetToHome can clear recents on logout', () => {
    useBrowseCityStore.getState().setCityId('brno', { name: 'Brno', country: 'CZ' });
    useBrowseCityStore.getState().resetToHome({ clearRecents: true });
    expect(useBrowseCityStore.getState().recents).toEqual([]);
  });
});
