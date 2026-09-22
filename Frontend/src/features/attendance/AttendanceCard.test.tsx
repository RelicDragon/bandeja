/**
 * PRD 346 — the attendance card.
 *
 * Rendered server-side, so no jsdom is needed: the assertions are about which
 * controls exist, which copy is used, and — the load-bearing one — that the
 * "your seat is yours either way" caption is always present next to the
 * buttons. That caption is the product principle made visible; a refactor that
 * drops it must fail.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { GameAttendanceDetails } from '@/api/attendance';
import type { UseGameAttendanceResult } from './useGameAttendance';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    // `key:name=value,name=value`, not JSON: `renderToStaticMarkup` escapes `"`
    // to `&quot;` in both text nodes and attribute values, so a JSON payload
    // could never be matched as written in the assertions below.
    t: (key: string, params?: Record<string, unknown>) =>
      params
        ? `${key}:${Object.entries(params)
            .map(([name, value]) => `${name}=${String(value)}`)
            .join(',')}`
        : key,
    i18n: { language: 'en-GB', resolvedLanguage: 'en-GB' },
  }),
}));

vi.mock('@/hooks/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => true,
}));

vi.mock('@/utils/networkStatus', () => ({
  useNetworkStore: (selector: (state: { isOnline: boolean }) => unknown) =>
    selector({ isOnline: true }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));

vi.mock('@/components', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div data-card>{children}</div>,
  PlayerAvatar: () => <span data-avatar />,
}));

vi.mock('@/components/ConfirmationModal', () => ({
  ConfirmationModal: ({ isOpen, title }: { isOpen: boolean; title: string }) =>
    isOpen ? <div data-dialog>{title}</div> : null,
}));

vi.mock('@/components/PremiumName', () => ({
  PremiumName: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

const { AttendanceCard } = await import('./AttendanceCard');

function makeDetails(overrides: Partial<GameAttendanceDetails> = {}): GameAttendanceDetails {
  return {
    confirmedCount: 2,
    unsureCount: 0,
    unansweredCount: 2,
    playingCount: 4,
    viewerAttendance: 'UNANSWERED',
    entries: [],
    participants: [],
    answersOpen: true,
    noShowWindowOpen: false,
    nudge: { allowed: true, remainingMs: 0, remainingHours: 0, nextAllowedAt: null },
    ...overrides,
  };
}

function makeAttendance(details: GameAttendanceDetails | undefined): UseGameAttendanceResult {
  return {
    details,
    isLoading: false,
    viewerAttendance: details?.viewerAttendance ?? null,
    isAnswering: false,
    isNudging: false,
    answer: vi.fn(async () => undefined),
    nudge: vi.fn(async () => ({ nudgedUserIds: [] })),
    noteNoShow: vi.fn(async () => undefined),
    undoNoShow: vi.fn(async () => undefined),
    attendanceOf: () => 'UNANSWERED',
    noShowNotedAt: () => null,
  };
}

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

describe('AttendanceCard', () => {
  it('asks the question with both answers and the required caption', () => {
    const html = render(
      <AttendanceCard
        attendance={makeAttendance(makeDetails())}
        canAnswer
        isOrganizer={false}
        players={[]}
        viewerUserId="u1"
        onRequestLeave={vi.fn()}
      />,
    );

    expect(html).toContain('attendance.question');
    expect(html).toContain('attendance.confirm');
    expect(html).toContain('attendance.unsure');
    // The product principle, made visible. Do not remove.
    expect(html).toContain('attendance.caption');
    // The only way out is the normal leave flow.
    expect(html).toContain('attendance.cantMakeIt');
  });

  it('compresses to one row with a Change button once answered', () => {
    const html = render(
      <AttendanceCard
        attendance={makeAttendance(makeDetails({ viewerAttendance: 'CONFIRMED' }))}
        canAnswer
        isOrganizer={false}
        players={[]}
        viewerUserId="u1"
        onRequestLeave={vi.fn()}
      />,
    );

    expect(html).toContain('attendance.confirmedState');
    expect(html).toContain('attendance.change');
    expect(html).not.toContain('attendance.question');
    expect(html).toContain('attendance.caption');
  });

  it('shows the amber "not sure" state', () => {
    const html = render(
      <AttendanceCard
        attendance={makeAttendance(makeDetails({ viewerAttendance: 'UNSURE' }))}
        canAnswer
        isOrganizer={false}
        players={[]}
        viewerUserId="u1"
        onRequestLeave={vi.fn()}
      />,
    );
    expect(html).toContain('attendance.unsureState');
    expect(html).toContain('amber');
  });

  it('renders nothing when the game has no time set (answers closed, not organizer)', () => {
    const html = render(
      <AttendanceCard
        attendance={makeAttendance(makeDetails({ answersOpen: false }))}
        canAnswer
        isOrganizer={false}
        players={[]}
        viewerUserId="u1"
        onRequestLeave={vi.fn()}
      />,
    );
    expect(html).toBe('');
  });

  it('renders nothing before the details land', () => {
    const html = render(
      <AttendanceCard
        attendance={makeAttendance(undefined)}
        canAnswer
        isOrganizer
        players={[]}
        viewerUserId="u1"
        onRequestLeave={vi.fn()}
      />,
    );
    expect(html).toBe('');
  });

  it('gives the organizer a progress pill and a Nudge button', () => {
    const html = render(
      <AttendanceCard
        attendance={makeAttendance(makeDetails())}
        canAnswer={false}
        isOrganizer
        players={[]}
        viewerUserId="u1"
        onRequestLeave={vi.fn()}
      />,
    );

    expect(html).toContain('attendance.organizer.progress');
    expect(html).toContain('confirmed=2');
    expect(html).toContain('total=4');
    expect(html).toContain('attendance.organizer.nudge');
    expect(html).toContain('role="progressbar"');
    // No answer UI for a non-playing organizer.
    expect(html).not.toContain('attendance.confirm"');
  });

  it('PRD 364: hides the strip when the Next steps block hosts it, and the card then renders nothing for a non-answering organizer', () => {
    const html = render(
      <AttendanceCard
        attendance={makeAttendance(makeDetails())}
        canAnswer={false}
        isOrganizer
        showOrganizerStrip={false}
        players={[]}
        viewerUserId="u1"
        onRequestLeave={vi.fn()}
      />,
    );

    expect(html).not.toContain('attendance.organizer.progress');
    expect(html).not.toContain('attendance.organizer.nudge');
    expect(html).toBe('');
  });

  it('PRD 364: keeps the strip by default (flag off renders today\'s card)', () => {
    const html = render(
      <AttendanceCard
        attendance={makeAttendance(makeDetails())}
        canAnswer={false}
        isOrganizer
        players={[]}
        viewerUserId="u1"
        onRequestLeave={vi.fn()}
      />,
    );
    expect(html).toContain('attendance.organizer.progress');
  });

  it('disables Nudge and shows the cooldown caption while it is on cooldown', () => {
    const html = render(
      <AttendanceCard
        attendance={makeAttendance(
          makeDetails({
            nudge: {
              allowed: false,
              remainingMs: 5 * 60 * 60 * 1000,
              remainingHours: 5,
              nextAllowedAt: '2026-06-15T17:00:00.000Z',
            },
          }),
        )}
        canAnswer={false}
        isOrganizer
        players={[]}
        viewerUserId="u1"
        onRequestLeave={vi.fn()}
      />,
    );

    expect(html).toContain('attendance.organizer.nudgeCooldown');
    expect(html).toContain('hours=5');
    expect(html).toContain('disabled');
  });

  it('uses only logical spacing utilities so ar mirrors correctly', () => {
    const html = render(
      <AttendanceCard
        attendance={makeAttendance(makeDetails())}
        canAnswer
        isOrganizer
        players={[]}
        viewerUserId="u1"
        onRequestLeave={vi.fn()}
      />,
    );
    expect(html).not.toMatch(/class="[^"]*\b(ml-|mr-|pl-|pr-|left-|right-)\d/);
  });
});
