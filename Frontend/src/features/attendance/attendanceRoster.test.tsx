/**
 * PRD 346 — roster dots, the no-show tag/overflow, the card right-rail stack,
 * and the optimistic patch.
 *
 * The optimistic patch test is the frontend half of the product invariant: a
 * local answer may move the viewer's own `attendance` and the derived counts,
 * and nothing else. No seat, no status, no other player's row.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { GameAttendanceDetails } from '@/api/attendance';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    i18n: { language: 'en-GB', resolvedLanguage: 'en-GB' },
  }),
}));

const { AttendanceDot } = await import('./AttendanceDot');
const { AttendanceRosterActions } = await import('./AttendanceRosterActions');
const { AttendanceRailSummary } = await import('./AttendanceRailSummary');
const { attendanceRailDataEqual } = await import('./attendanceRailData');
const { patchViewerAnswer } = await import('./attendancePatch');

describe('AttendanceDot', () => {
  it('always renders a visually-hidden text equivalent', () => {
    for (const state of ['CONFIRMED', 'UNSURE', 'UNANSWERED', 'NO_SHOW'] as const) {
      const html = renderToStaticMarkup(<AttendanceDot state={state} />);
      expect(html).toContain('sr-only');
      expect(html).toContain('attendance.dots.');
      expect(html).toContain(`data-attendance-state="${state}"`);
    }
  });

  it('marks the decorative glyph aria-hidden so it is not read twice', () => {
    const html = renderToStaticMarkup(<AttendanceDot state="UNSURE" />);
    expect(html).toContain('aria-hidden');
  });

  it('becomes a pressable button when a legend handler is passed', () => {
    // `contextmenu` alone is unreachable on iOS WebKit and for keyboard users,
    // so the legend affordance has to be a real control.
    const html = renderToStaticMarkup(
      <AttendanceDot state="CONFIRMED" onRequestLegend={vi.fn()} />,
    );
    expect(html).toContain('<button');
    expect(html).toContain('attendance.legend.title');
    expect(html).not.toContain('pointer-events-none');
  });

  it('stays inert when no legend handler is passed', () => {
    const html = renderToStaticMarkup(<AttendanceDot state="CONFIRMED" />);
    expect(html).not.toContain('<button');
    expect(html).toContain('pointer-events-none');
  });
});

describe('AttendanceRosterActions', () => {
  it('renders nothing for a plain row', () => {
    const html = renderToStaticMarkup(
      <AttendanceRosterActions state="CONFIRMED" canNote={false} />,
    );
    expect(html).toBe('');
  });

  it('shows the grey no-show tag, never a red one', () => {
    const html = renderToStaticMarkup(<AttendanceRosterActions state="NO_SHOW" canNote={false} />);
    expect(html).toContain('attendance.noShow.tag');
    expect(html).toContain('bg-gray-200');
    expect(html).not.toContain('red');
  });

  it('offers the note action to an organizer with a 44 px target', () => {
    const html = renderToStaticMarkup(
      <AttendanceRosterActions state="UNANSWERED" canNote onNote={vi.fn()} />,
    );
    expect(html).toContain('attendance.noShow.action');
    expect(html).toContain('h-11 w-11');
  });

  it('offers undo once a row is already noted', () => {
    const html = renderToStaticMarkup(
      <AttendanceRosterActions state="NO_SHOW" canNote onUndo={vi.fn()} />,
    );
    expect(html).toContain('attendance.noShow.undoAction');
  });
});

describe('AttendanceRailSummary', () => {
  const data = {
    confirmedCount: 3,
    playingCount: 4,
    players: [
      { userId: 'a', initial: 'A', avatarUrl: null, state: 'CONFIRMED' as const },
      { userId: 'b', initial: 'B', avatarUrl: null, state: 'UNANSWERED' as const },
    ],
  };

  it('renders the fraction and an accessible summary', () => {
    const html = renderToStaticMarkup(<AttendanceRailSummary data={data} locale="en" />);
    expect(html).toContain('3/4');
    expect(html).toContain('attendance.card.ariaSummary');
  });

  it('adds no urgency treatment — no border colour, no red', () => {
    const html = renderToStaticMarkup(<AttendanceRailSummary data={data} locale="en" />);
    expect(html).not.toContain('red');
    expect(html).not.toMatch(/border-(red|amber|orange)/);
  });

  it('renders nothing when there are no PLAYING players', () => {
    const html = renderToStaticMarkup(
      <AttendanceRailSummary data={{ ...data, playingCount: 0 }} locale="en" />,
    );
    expect(html).toBe('');
  });

  it('compares structurally so the memoised right rail repaints on a live change', () => {
    expect(attendanceRailDataEqual(data, { ...data })).toBe(true);
    expect(attendanceRailDataEqual(data, { ...data, confirmedCount: 4 })).toBe(false);
    expect(
      attendanceRailDataEqual(data, {
        ...data,
        players: [{ ...data.players[0], state: 'UNSURE' as const }, data.players[1]],
      }),
    ).toBe(false);
    expect(attendanceRailDataEqual(null, data)).toBe(false);
    expect(attendanceRailDataEqual(null, null)).toBe(true);
  });
});

describe('patchViewerAnswer — the optimistic write', () => {
  const details: GameAttendanceDetails = {
    confirmedCount: 1,
    unsureCount: 0,
    unansweredCount: 2,
    playingCount: 3,
    viewerAttendance: 'UNANSWERED',
    entries: [],
    participants: [
      {
        userId: 'me',
        attendance: 'UNANSWERED',
        attendanceUpdatedAt: null,
        noShowNotedAt: null,
        noShowNotedById: null,
      },
      {
        userId: 'other',
        attendance: 'CONFIRMED',
        attendanceUpdatedAt: '2026-06-01T00:00:00.000Z',
        noShowNotedAt: null,
        noShowNotedById: null,
      },
      {
        userId: 'third',
        attendance: 'UNANSWERED',
        attendanceUpdatedAt: null,
        noShowNotedAt: null,
        noShowNotedById: null,
      },
    ],
    answersOpen: true,
    noShowWindowOpen: false,
    nudge: { allowed: true, remainingMs: 0, remainingHours: 0, nextAllowedAt: null },
  };

  it('moves only the viewer row and the derived counts', () => {
    const next = patchViewerAnswer(details, 'me', 'CONFIRMED');

    expect(next.participants.find((row) => row.userId === 'me')?.attendance).toBe('CONFIRMED');
    expect(next.viewerAttendance).toBe('CONFIRMED');
    expect(next.confirmedCount).toBe(2);
    expect(next.unansweredCount).toBe(1);

    // Everybody else is byte-identical.
    expect(next.participants.find((row) => row.userId === 'other')).toEqual(
      details.participants[1],
    );
    expect(next.participants.find((row) => row.userId === 'third')).toEqual(
      details.participants[2],
    );
  });

  it('never changes the roster size, the open window or the no-show state', () => {
    const next = patchViewerAnswer(details, 'me', 'UNSURE');
    expect(next.participants).toHaveLength(details.participants.length);
    expect(next.playingCount).toBe(details.playingCount);
    expect(next.answersOpen).toBe(details.answersOpen);
    expect(next.noShowWindowOpen).toBe(details.noShowWindowOpen);
    expect(next.nudge).toEqual(details.nudge);
    for (const row of next.participants) {
      expect(row.noShowNotedAt).toBeNull();
      expect(row.noShowNotedById).toBeNull();
    }
  });

  it('does not mutate the cached object in place', () => {
    const snapshot = JSON.stringify(details);
    patchViewerAnswer(details, 'me', 'CONFIRMED');
    expect(JSON.stringify(details)).toBe(snapshot);
  });
});
