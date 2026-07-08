import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getManualClubBookingPreference,
  setManualClubBookingPreference,
} from './manualClubBookingPreference';

function installLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
  });
}

describe('manualClubBookingPreference', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    installLocalStorage();
  });

  it('stores manual booking opt-out per club', () => {
    setManualClubBookingPreference('club-1', true);

    expect(getManualClubBookingPreference('club-1')).toBe(true);
    expect(getManualClubBookingPreference('club-2')).toBe(false);
  });

  it('clears a club preference without affecting other clubs', () => {
    setManualClubBookingPreference('club-1', true);
    setManualClubBookingPreference('club-2', true);
    setManualClubBookingPreference('club-1', false);

    expect(getManualClubBookingPreference('club-1')).toBe(false);
    expect(getManualClubBookingPreference('club-2')).toBe(true);
  });
});
