// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CostShare, GameCostSummary } from '@/api/gameCost';
import type { GameAttendanceDetails } from '@/api/attendance';
import type { UseGameAttendanceResult } from '@/features/attendance/useGameAttendance';
import type { AttendanceDotState } from '@/features/attendance/attendanceVisuals';
import type { Game } from '@/types';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const query = vi.hoisted(() => ({ data: undefined as GameCostSummary | undefined }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      `${key}|${options ? JSON.stringify(options) : ''}`,
    i18n: { language: 'en' },
  }),
}));
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/games/g1', search: '' }),
  useNavigate: () => vi.fn(),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@/config/featureFlags', () => ({ isCostSplitEnabled: () => true }));
vi.mock('@/store/socketEventsStore', () => ({ useSocketEventsStore: () => null }));
vi.mock('@/store/authStore', () => ({ useAuthStore: () => null }));
vi.mock('@/utils/networkStatus', () => ({ useNetworkStore: () => true }));
vi.mock('@/hooks/usePrefersReducedMotion', () => ({ usePrefersReducedMotion: () => true }));
vi.mock('@shared/gameMutationLock', () => ({ canMutateGameRoster: () => true }));
vi.mock('@/components/PlayerAvatar', () => ({ PlayerAvatar: () => <span data-avatar="" /> }));
vi.mock('@/components/PremiumName', () => ({ PremiumName: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/components/InvitesList', () => ({ InvitesList: () => null }));
vi.mock('@/components/ConfirmationModal', () => ({ ConfirmationModal: () => null }));
vi.mock('@/components/sportQuestionnaire', () => ({ SportQuestionnaireInviteNudge: () => null }));
vi.mock('../ParticipantSetupTags', () => ({ ParticipantSetupTags: () => null }));
vi.mock('../cost/CostSettleSheet', () => ({ CostSettleSheet: () => null }));
vi.mock('../cost/CostShareEditSheet', () => ({ CostShareEditSheet: () => null }));
vi.mock('@/queries/useGameCostQuery', () => ({
  useGameCostQuery: () => ({ data: query.data, isPending: false, isError: false }),
  useGameCostMutations: () => {
    const mutation = { mutate: vi.fn(), isPending: false };
    return { markPaid: mutation, confirm: mutation, update: mutation, remind: mutation };
  },
}));

import { GameRoster, type GameRosterProps } from './GameRoster';

const NAMES = ['Marko', 'Ana', 'Ivo', 'Lea'];

function user(name: string) {
  return { id: name, firstName: name, lastName: '', avatar: null, level: 3, socialLevel: 3, gender: 'MALE', approvedLevel: true, isTrainer: false };
}

function makeGame(names = NAMES, max = 4): Game {
  return {
    id: 'g1', entityType: 'GAME', genderTeams: 'ANY', maxParticipants: max, status: 'ANNOUNCED',
    resultsStatus: 'NONE', allowDirectJoin: true, minLevel: null, maxLevel: null, sport: null,
    participants: names.map((name, index) => ({
      userId: name, role: index === 0 ? 'OWNER' : 'PARTICIPANT', status: 'PLAYING',
      joinedAt: '2026-10-01T10:00:00.000Z', user: user(name),
    })),
  } as unknown as Game;
}

const shares: CostShare[] = NAMES.map((name, index) => ({
  userId: name, user: user(name) as CostShare['user'], amountMinor: 1000, currency: 'EUR',
  state: index === 0 || index === 3 ? 'SETTLED' : 'UNPAID', markedPaidAt: null, confirmedAt: null,
  method: 'MANUAL', transactionId: null, isPayer: index === 0, isOverridden: false,
}));

function summary(overrides: Partial<GameCostSummary> = {}): GameCostSummary {
  return {
    gameId: 'g1', available: true, totalMinor: 4000, currency: 'EUR', payerUserId: 'Marko',
    payer: shares[0].user, paymentHint: null, paymentMethods: [], countryIso2: null, frozenAt: null,
    estimated: true, shares, settledCount: 2, shareCount: 4, outstandingMinor: 2000,
    viewerShare: shares[1], canManage: false, canConfirm: false, canRemind: false,
    coinsPerCurrencyUnit: null, viewerCoinCost: null, viewerCoinBalance: 0, remindAvailableAt: null,
    ...overrides,
  };
}

function attendance(details: Partial<GameAttendanceDetails> | null): UseGameAttendanceResult {
  return {
    details: details
      ? ({
          confirmedCount: 1, unsureCount: 1, unansweredCount: 2, playingCount: 4, viewerAttendance: 'UNANSWERED',
          entries: [], participants: [], answersOpen: true, noShowWindowOpen: false,
          nudge: { allowed: true, remainingMs: 0, remainingHours: 0, nextAllowedAt: null },
          ...details,
        } as GameAttendanceDetails)
      : undefined,
    isLoading: false, viewerAttendance: null, isAnswering: false, isNudging: false,
    answer: vi.fn(), nudge: vi.fn(), noteNoShow: vi.fn(), undoNoShow: vi.fn(),
    attendanceOf: () => 'UNANSWERED', noShowNotedAt: () => null,
  };
}

const DOTS: Record<string, AttendanceDotState> = { Marko: 'CONFIRMED', Ana: 'UNANSWERED', Ivo: 'UNSURE', Lea: 'UNANSWERED' };

describe('GameRoster', () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(overrides: Partial<GameRosterProps> = {}, data: GameCostSummary | undefined = summary()) {
    query.data = data;
    const props: GameRosterProps = {
      game: makeGame(), mode: 'live', myInvites: [], gameInvites: [], userId: 'Ana', isGuest: false,
      isFull: true, isOwner: false, isUserOwner: false, isInJoinQueue: false, isUserPlaying: true,
      canInvitePlayers: false, canManageJoinQueue: false, canViewSettings: false, costEnabled: true,
      expectCost: true, attendance: attendance({}), attendanceByUserId: DOTS, hideNudge: false,
      onJoin: vi.fn(), onAddToGame: vi.fn(), onLeave: vi.fn(), onAcceptInvite: vi.fn(),
      onDeclineInvite: vi.fn(), onCancelInvite: vi.fn(), onAcceptJoinQueue: vi.fn(),
      onDeclineJoinQueue: vi.fn(), onShowPlayerList: vi.fn(), onShowManageUsers: vi.fn(),
      ...overrides,
    };
    act(() => root.render(<GameRoster {...props} />));
  }

  it('lists every player once and shows a regular player only their own share', () => {
    render();
    for (const name of NAMES) expect(container.querySelectorAll(`[data-roster-row="${name}"]`)).toHaveLength(1);
    expect(container.textContent?.match(/€10\.00/g)).toHaveLength(1);
    expect(container.textContent).not.toContain('€40.00');
    expect(container.textContent).not.toContain('€20.00');
    expect(container.textContent).toContain('cost.summaryAllSettled|{"settled":2,"total":4}');
    expect(container.textContent).toContain('cost.iPaid');
    expect(container.querySelectorAll('[role="checkbox"]')).toHaveLength(0);
  });

  it('shows everyone their answers and asks the viewer with the required caption', () => {
    render();
    expect(container.textContent).toContain('attendance.dots.unsure');
    expect(container.textContent).toContain('attendance.question');
    expect(container.textContent).toContain('attendance.confirm');
    expect(container.textContent).toContain('attendance.unsure');
    expect(container.textContent).toContain('attendance.caption');
    expect(container.textContent).toContain('attendance.cantMakeIt');
  });

  it('folds the viewer row to one line once answered and paid, with a Change control', () => {
    render(
      { attendanceByUserId: { ...DOTS, Ana: 'CONFIRMED' } },
      summary({ shares: shares.map((s) => (s.userId === 'Ana' ? { ...s, state: 'MARKED_PAID' } : s)), viewerShare: { ...shares[1], state: 'MARKED_PAID' } }),
    );
    expect(container.textContent).not.toContain('attendance.question');
    expect(container.textContent).toContain('attendance.confirmedState');
    expect(container.querySelector('[aria-label="attendance.change|"]')).not.toBeNull();
  });

  it('opens on Change and folds again from the same control', () => {
    render(
      { attendanceByUserId: { ...DOTS, Ana: 'CONFIRMED' } },
      summary({ shares: shares.map((s) => (s.userId === 'Ana' ? { ...s, state: 'MARKED_PAID' } : s)), viewerShare: { ...shares[1], state: 'MARKED_PAID' } }),
    );
    const toggle = () => container.querySelector<HTMLButtonElement>('[aria-label="attendance.change|"]')!;
    act(() => toggle().click());
    expect(container.textContent).toContain('attendance.question');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    act(() => toggle().click());
    // The expanded block may still be mid-exit; the control's state is the contract.
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('never asks the owner, and gives the payer every row with a received toggle', () => {
    render(
      { userId: 'Marko', isOwner: true, isUserOwner: true },
      summary({ canManage: true, canConfirm: true, canRemind: true, viewerShare: shares[0] }),
    );
    expect(container.textContent).not.toContain('attendance.question');
    expect(container.textContent?.match(/€10\.00/g)?.length).toBeGreaterThanOrEqual(4);
    expect(container.querySelectorAll('[role="checkbox"]')).toHaveLength(3);
    expect(container.textContent).toContain('cost.totalLine|{"amount":"€40.00"}');
    expect(container.textContent).toContain('cost.remindUnpaid');
    expect(container.textContent).toContain('attendance.organizer.nudge');
  });

  it('PRD 364: leaves Nudge to "Next steps" when it hosts it', () => {
    render({ userId: 'Marko', isOwner: true, isUserOwner: true, hideNudge: true }, summary({ canManage: true }));
    expect(container.textContent).not.toContain('attendance.organizer.nudge');
  });

  it('renders nothing in ledger mode when the viewer has nothing left to do', () => {
    render({ mode: 'ledger', attendance: attendance({ answersOpen: false }) }, summary({ available: false }));
    expect(container.innerHTML).toBe('');
  });

  it('keeps only the viewer row in ledger mode for a regular player', () => {
    render({ mode: 'ledger', attendance: attendance({ answersOpen: false }) });
    expect(container.querySelectorAll('[data-roster-row]')).toHaveLength(1);
    expect(container.querySelector('[data-roster-row="Ana"]')).not.toBeNull();
  });

  it('turns a big roster into filter chips and a collapsed list', () => {
    const names = Array.from({ length: 20 }, (_, index) => `P${index}`);
    render({ game: makeGame(names, 24), userId: 'P0', attendanceByUserId: {} }, summary({ available: false }));
    expect(container.querySelector('[role="toolbar"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-roster-row]')).toHaveLength(1 + 8);
    expect(container.textContent).toContain('attendance.roster.showAll|{"total":20}');
    expect(container.textContent).toContain('common.all|20');
  });

  it('uses only logical spacing utilities so ar mirrors correctly', () => {
    render({ userId: 'Marko', isOwner: true, isUserOwner: true }, summary({ canManage: true, canConfirm: true }));
    expect(container.innerHTML).not.toMatch(/\b(?:ml|mr|pl|pr)-\d/);
  });
});
