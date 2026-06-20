import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: vi.fn(),
  },
}));

import { Capacitor } from '@capacitor/core';
import { resolveBooktimeSignupPlatform } from './resolveBooktimeSignupPlatform';

describe('resolveBooktimeSignupPlatform', () => {
  afterEach(() => {
    vi.mocked(Capacitor.getPlatform).mockReset();
  });

  it('returns ios on native iOS', () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue('ios');
    expect(resolveBooktimeSignupPlatform()).toBe('ios');
  });

  it('returns android on native Android', () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
    expect(resolveBooktimeSignupPlatform()).toBe('android');
  });

  it('returns android on web (Booktime has no web platform enum)', () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue('web');
    expect(resolveBooktimeSignupPlatform()).toBe('android');
  });
});
