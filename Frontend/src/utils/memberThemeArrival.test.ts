// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  MEMBER_THEME_ARRIVAL_MS,
  armMemberThemeArrival,
  cancelMemberThemeArrival,
  setMemberThemeArrivalHeaderVisible,
} from './memberThemeArrival';

const root = document.documentElement;
const arriving = () => root.classList.contains('member-theme-arrival');

afterEach(() => {
  cancelMemberThemeArrival();
  setMemberThemeArrivalHeaderVisible(false);
  delete root.dataset.memberTheme;
  vi.useRealTimers();
});

it('waits for a header, plays once for the arrival window and never on remount', () => {
  vi.useFakeTimers();
  root.dataset.memberTheme = 'ocean';
  armMemberThemeArrival();
  vi.advanceTimersByTime(5000);
  expect(arriving()).toBe(true);
  setMemberThemeArrivalHeaderVisible(true);
  vi.advanceTimersByTime(MEMBER_THEME_ARRIVAL_MS - 1);
  expect(arriving()).toBe(true);
  vi.advanceTimersByTime(1);
  expect(arriving()).toBe(false);
  setMemberThemeArrivalHeaderVisible(false);
  setMemberThemeArrivalHeaderVisible(true);
  expect(arriving()).toBe(false);
});

it('replays after a long background but not a short one, and never for Classic', () => {
  vi.useFakeTimers();
  root.dataset.memberTheme = 'spring';
  setMemberThemeArrivalHeaderVisible(true);
  armMemberThemeArrival();
  vi.advanceTimersByTime(MEMBER_THEME_ARRIVAL_MS);
  const visibility = vi.spyOn(document, 'visibilityState', 'get');
  visibility.mockReturnValue('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
  vi.advanceTimersByTime(60_000);
  visibility.mockReturnValue('visible');
  document.dispatchEvent(new Event('visibilitychange'));
  expect(arriving()).toBe(false);
  visibility.mockReturnValue('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
  vi.advanceTimersByTime(11 * 60_000);
  visibility.mockReturnValue('visible');
  document.dispatchEvent(new Event('visibilitychange'));
  expect(arriving()).toBe(true);
  visibility.mockRestore();

  delete root.dataset.memberTheme;
  armMemberThemeArrival();
  expect(arriving()).toBe(false);
});
