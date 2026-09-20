/**
 * PRD 346 — pure presentation rules.
 *
 * The important assertions here are the accessibility ones: every dot state
 * carries a text equivalent, and the "Shows up" ring never grades a player by
 * colour.
 */
import { describe, expect, it } from 'vitest';
import {
  attendanceDotStyle,
  attendanceErrorKey,
  confirmedPercent,
  formatFraction,
  formatPercent,
  resolveDotState,
  ringDashOffset,
  shouldShowAttendanceRate,
  SHOWS_UP_RING_CIRCUMFERENCE,
  type AttendanceDotState,
} from './attendanceVisuals';

const ALL_STATES: AttendanceDotState[] = ['CONFIRMED', 'UNSURE', 'UNANSWERED', 'NO_SHOW'];

describe('attendance dot styles', () => {
  it('gives every state a distinct text equivalent, so colour is never the only signal', () => {
    const labels = ALL_STATES.map((state) => attendanceDotStyle(state).labelKey);
    expect(new Set(labels).size).toBe(ALL_STATES.length);
    for (const key of labels) expect(key.startsWith('attendance.dots.')).toBe(true);
  });

  it('distinguishes confirmed from unanswered by shape as well as colour', () => {
    expect(attendanceDotStyle('CONFIRMED').filled).toBe(true);
    expect(attendanceDotStyle('UNANSWERED').filled).toBe(false);
  });

  it('uses no physical-direction utilities (RTL safe)', () => {
    for (const state of ALL_STATES) {
      const className = attendanceDotStyle(state).className;
      expect(className).not.toMatch(/\b(ml-|mr-|pl-|pr-|left-|right-|border-l|border-r)/);
    }
  });

  it('falls back to the unanswered ring for an unknown state', () => {
    expect(attendanceDotStyle('WAT' as AttendanceDotState).labelKey).toBe(
      'attendance.dots.unanswered',
    );
  });
});

describe('resolveDotState', () => {
  it('lets a no-show note outrank the answer', () => {
    expect(resolveDotState('CONFIRMED', '2026-06-01T10:00:00.000Z')).toBe('NO_SHOW');
  });

  it('maps the three answers', () => {
    expect(resolveDotState('CONFIRMED', null)).toBe('CONFIRMED');
    expect(resolveDotState('UNSURE', null)).toBe('UNSURE');
    expect(resolveDotState('UNANSWERED', null)).toBe('UNANSWERED');
    expect(resolveDotState(undefined, undefined)).toBe('UNANSWERED');
  });
});

describe('confirmedPercent', () => {
  it('fills the organizer pill proportionally', () => {
    expect(confirmedPercent(2, 4)).toBe(50);
    expect(confirmedPercent(0, 4)).toBe(0);
    expect(confirmedPercent(4, 4)).toBe(100);
  });

  it('never returns NaN or an out-of-range width', () => {
    expect(confirmedPercent(1, 0)).toBe(0);
    expect(confirmedPercent(9, 4)).toBe(100);
    expect(confirmedPercent(Number.NaN, 4)).toBe(0);
  });
});

describe('the "Shows up" ring', () => {
  it('is empty at 0 and full at 100', () => {
    expect(ringDashOffset(0)).toBeCloseTo(SHOWS_UP_RING_CIRCUMFERENCE);
    expect(ringDashOffset(100)).toBeCloseTo(0);
  });

  it('clamps out-of-range values instead of overdrawing', () => {
    expect(ringDashOffset(-20)).toBeCloseTo(SHOWS_UP_RING_CIRCUMFERENCE);
    expect(ringDashOffset(150)).toBeCloseTo(0);
  });
});

describe('the >= 5 sample threshold', () => {
  it('hides the tile below the floor, so one missed game is never a verdict', () => {
    expect(shouldShowAttendanceRate({ rate: 0, sampleSize: 1, minSample: 5 })).toBe(false);
    expect(shouldShowAttendanceRate({ rate: 80, sampleSize: 4, minSample: 5 })).toBe(false);
    expect(shouldShowAttendanceRate(null)).toBe(false);
    expect(shouldShowAttendanceRate(undefined)).toBe(false);
    expect(shouldShowAttendanceRate({ rate: null, sampleSize: 9, minSample: 5 })).toBe(false);
  });

  it('shows the tile once there is enough data', () => {
    expect(shouldShowAttendanceRate({ rate: 80, sampleSize: 5, minSample: 5 })).toBe(true);
    expect(shouldShowAttendanceRate({ rate: 0, sampleSize: 6, minSample: 5 })).toBe(true);
  });
});

describe('locale-aware numbers (no identical-English i18n keys)', () => {
  it('formats a percentage', () => {
    expect(formatPercent(75, 'en')).toContain('75');
    expect(formatPercent(75, 'not-a-locale')).toContain('75');
  });

  it('formats the card fraction', () => {
    expect(formatFraction(3, 4, 'en')).toBe('3/4');
  });
});

describe('attendanceErrorKey', () => {
  it('maps every backend code into our own namespace', () => {
    expect(attendanceErrorKey('errors.attendance.notParticipant')).toBe(
      'attendance.errors.notParticipant',
    );
    expect(attendanceErrorKey('errors.attendance.nudgeCooldown')).toBe(
      'attendance.errors.nudgeCooldown',
    );
    expect(attendanceErrorKey('errors.attendance.noShowWindowClosed')).toBe(
      'attendance.errors.noShowWindowClosed',
    );
  });

  it('falls back to a generic message rather than leaking a raw code', () => {
    expect(attendanceErrorKey(undefined)).toBe('attendance.errors.generic');
    expect(attendanceErrorKey('boom')).toBe('attendance.errors.generic');
    expect(attendanceErrorKey(42)).toBe('attendance.errors.generic');
  });
});
