import { describe, expect, it } from 'vitest';
import { deriveFindCalendarGamesLoading } from './deriveFindCalendarGamesLoading';

describe('deriveFindCalendarGamesLoading', () => {
  it('uses month loading when day scope is off', () => {
    expect(
      deriveFindCalendarGamesLoading({
        dayScopedEnabled: false,
        loadingCalendar: true,
        dayListReady: false,
      }),
    ).toBe(true);
    expect(
      deriveFindCalendarGamesLoading({
        dayScopedEnabled: false,
        loadingCalendar: false,
        dayListReady: false,
      }),
    ).toBe(false);
  });

  it('is loading while day authority is null even if month settled', () => {
    expect(
      deriveFindCalendarGamesLoading({
        dayScopedEnabled: true,
        loadingCalendar: false,
        dayListReady: false,
      }),
    ).toBe(true);
  });

  it('is not loading when day settled empty while month still loading', () => {
    expect(
      deriveFindCalendarGamesLoading({
        dayScopedEnabled: true,
        loadingCalendar: true,
        dayListReady: true,
      }),
    ).toBe(false);
  });

  it('is not loading when day settled with cards', () => {
    expect(
      deriveFindCalendarGamesLoading({
        dayScopedEnabled: true,
        loadingCalendar: true,
        dayListReady: true,
      }),
    ).toBe(false);
  });
});
