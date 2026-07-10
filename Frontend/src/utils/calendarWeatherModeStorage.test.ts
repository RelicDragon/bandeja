import { afterEach, describe, expect, it, vi } from 'vitest';
import { readCalendarWeatherMode, writeCalendarWeatherMode } from './calendarWeatherModeStorage';

describe('calendarWeatherModeStorage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to false when storage is empty', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    });

    expect(readCalendarWeatherMode('my')).toBe(false);
    expect(readCalendarWeatherMode('timeSlots')).toBe(true);
  });

  it('persists enabled state', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    });

    writeCalendarWeatherMode('my', true);
    expect(readCalendarWeatherMode('my')).toBe(true);

    writeCalendarWeatherMode('my', false);
    expect(readCalendarWeatherMode('my')).toBe(false);
  });

  it('stores My and Find calendar weather modes independently', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    });

    writeCalendarWeatherMode('my', true);
    expect(readCalendarWeatherMode('my')).toBe(true);
    expect(readCalendarWeatherMode('find')).toBe(false);

    writeCalendarWeatherMode('find', true);
    writeCalendarWeatherMode('my', false);

    expect(readCalendarWeatherMode('my')).toBe(false);
    expect(readCalendarWeatherMode('find')).toBe(true);
  });
});
