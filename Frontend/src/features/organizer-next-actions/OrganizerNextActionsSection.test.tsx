/**
 * PRD 364 — the container: the block's data really comes from the shell's own
 * attendance hook, the game payload and the Cost card's query, and each
 * action lands on the existing workflow.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { GameAttendanceDetails } from '@/api/attendance';
import type { GameCostSummary } from '@/api/gameCost';
import type { Game } from '@/types';
import type { UseGameAttendanceResult } from '@/features/attendance/useGameAttendance';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params
        ? `${key}:${Object.entries(params)
            .map(([name, value]) => `${name}=${String(value)}`)
            .join(',')}`
        : key,
    i18n: { language: 'en-GB', resolvedLanguage: 'en-GB' },
  }),
}));
vi.mock('@/hooks/usePrefersReducedMotion', () => ({ usePrefersReducedMotion: () => true }));
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/games/g1', search: '' }),
}));
vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div data-card>{children}</div>,
}));

let costSummary: GameCostSummary | undefined;
vi.mock('@/queries/useGameCostQuery', () => ({
  useGameCostQuery: () => ({ data: costSummary }),
}));

const { OrganizerNextActionsSection } = await import('./OrganizerNextActionsSection');

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    entityType: 'GAME',
    status: 'ANNOUNCED',
    resultsStatus: 'NONE',
    timeIsSet: true,
    maxParticipants: 4,
    clubId: 'c1',
    hasBookedCourt: false,
    participants: [
      { userId: 'p1', status: 'PLAYING' },
      { userId: 'p2', status: 'PLAYING' },
      { userId: 'p3', status: 'PLAYING' },
    ],
    joinQueues: [],
    ...overrides,
  } as unknown as Game;
}

function makeAttendance(details: Partial<GameAttendanceDetails> | undefined): UseGameAttendanceResult {
  return {
    details: details
      ? ({
          confirmedCount: 2,
          playingCount: 3,
          answersOpen: true,
          noShowWindowOpen: false,
          participants: [],
          nudge: { allowed: true, remainingMs: 0, remainingHours: 0, nextAllowedAt: null },
          ...details,
        } as GameAttendanceDetails)
      : undefined,
    isLoading: false,
    viewerAttendance: null,
    isAnswering: false,
    isNudging: false,
    answer: async () => undefined,
    nudge: async () => ({ nudgedUserIds: [] }),
    noteNoShow: async () => undefined,
    undoNoShow: async () => undefined,
    attendanceOf: () => 'UNANSWERED',
    noShowNotedAt: () => null,
  };
}

function makeCost(unpaid: number): GameCostSummary {
  const shares = [
    { userId: 'p1', isPayer: true, state: 'SETTLED' },
    ...Array.from({ length: unpaid }, (_, i) => ({ userId: `d${i}`, isPayer: false, state: 'UNPAID' })),
    { userId: 'x', isPayer: false, state: 'MARKED_PAID' },
  ];
  return {
    gameId: 'g1',
    available: true,
    totalMinor: 4000,
    currency: 'EUR',
    shares,
    shareCount: shares.length,
    settledCount: 1,
    outstandingMinor: unpaid * 1000,
    viewerShare: null,
  } as unknown as GameCostSummary;
}

function render(props: Partial<Parameters<typeof OrganizerNextActionsSection>[0]> = {}) {
  return renderToStaticMarkup(
    <OrganizerNextActionsSection
      game={makeGame()}
      viewerRole="organizer"
      canInvite
      canManageQueue
      attendance={makeAttendance({})}
      attendanceEnabled
      costVisible
      onInvite={() => undefined}
      onEditCourt={() => undefined}
      {...props}
    />,
  );
}

describe('OrganizerNextActionsSection', () => {
  it('derives seats, booking and attendance from the shell data, in that order', () => {
    costSummary = undefined;
    const html = render();
    const seats = html.indexOf('organizer-hint-seats');
    const booking = html.indexOf('organizer-hint-booking');
    expect(seats).toBeGreaterThan(-1);
    expect(booking).toBeGreaterThan(seats);
    expect(html).toContain('organizerNextActions.seats.needed:count=1');
    expect(html).toContain('organizerNextActions.booking.notBooked');
    expect(html).toContain('organizerNextActions.booking.editCourt');
    // Third hint is behind the fold.
    expect(html).toContain('organizerNextActions.more:count=1');
  });

  it('counts only UNPAID non-payer shares from the Cost card query', () => {
    costSummary = makeCost(2);
    const html = render({ game: makeGame({ resultsStatus: 'FINAL' }) });
    expect(html).toContain('organizerNextActions.cost.unpaid:count=2');
    expect(html).not.toContain('organizer-hint-seats');
    expect(html).not.toContain('organizer-hint-booking');
    expect(html).not.toContain('organizer-hint-attendance');
  });

  it('renders nothing when the ledger is settled and the game is FINAL', () => {
    costSummary = makeCost(0);
    expect(render({ game: makeGame({ resultsStatus: 'FINAL' }) })).toBe('');
  });

  it('reads partial external coverage from the game payload', () => {
    costSummary = undefined;
    const html = render({
      game: makeGame({
        bookingStatus: 'EXTERNAL_PARTIAL',
        linkedBookings: [{ id: 'l1', externalBookingId: 'b1', externalBookingProvider: 'BOOKTIME' }],
      }),
    });
    expect(html).toContain('organizerNextActions.booking.partlyBooked');
    expect(html).toContain('organizerNextActions.booking.seeBookings');
  });

  it('gives an inviter only the seats line', () => {
    costSummary = makeCost(2);
    const html = render({ viewerRole: 'inviter' });
    expect(html).toContain('organizer-hint-seats');
    expect(html).toContain('organizerNextActions.seats.invite');
    expect(html).not.toContain('organizer-hint-booking');
    expect(html).not.toContain('organizer-hint-cost');
  });

  it('skips attendance when the shell gate is off or details have not loaded', () => {
    costSummary = undefined;
    expect(render({ attendanceEnabled: false, game: makeGame({ participants: [] }) })).not.toContain(
      'organizer-hint-attendance',
    );
    expect(render({ attendance: makeAttendance(undefined) })).not.toContain('organizer-hint-attendance');
  });
});
