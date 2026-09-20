// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  // Something in the import graph reaches `@/i18n/config`, which calls
  // `i18n.use(initReactI18next)` at module load; the mock must carry it.
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

// vaul renders through a portal and measures the viewport; the sheet's own
// behaviour is what is under test, so the surface is reduced to plain elements.
vi.mock('@/components/ui/Drawer', () => ({
  Drawer: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="drawer">{children}</div> : null,
  DrawerContent: ({ children, ...rest }: Record<string, unknown> & { children: React.ReactNode }) => (
    <div {...(rest as Record<string, string>)}>{children}</div>
  ),
  DrawerCloseButton: () => <button type="button">close</button>,
}));

vi.mock('@/hooks/useBackButtonModal', () => ({ useBackButtonModal: () => {} }));
vi.mock('@/components/userTeam/AddUserTeamToGameSheet', () => ({
  AddUserTeamToGameSheet: ({ teamId }: { teamId: string }) => (
    <div data-testid="invite-sheet" data-team-id={teamId} />
  ),
}));

const ensurePairTeam = vi.fn(async () => 'team-new');
vi.mock('./ensurePairTeam', () => ({ ensurePairTeam: (...args: unknown[]) => ensurePairTeam(...(args as [])) }));

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (state: { user: { id: string } }) => unknown) =>
    selector({ user: { id: 'me' } }),
}));

let queryData: unknown = null;
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: queryData, isLoading: queryData === null }),
  // `PairSheet` invalidates the pair queries after creating a team.
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
}));

// The share/native affordances probe Capacitor at module load.
vi.mock('@/utils/capacitor', () => ({
  isCapacitor: () => false,
  isAndroid: () => false,
  isIOS: () => false,
}));

import type { PairDetail } from '@/api/pairs';
import { PairSheet } from './PairSheet';

function detail(overrides: Partial<PairDetail> = {}): PairDetail {
  const member = (id: string, firstName: string) => ({
    id,
    firstName,
    lastName: null,
    avatar: null,
    isPremium: false,
    showPremiumStatus: false,
    level: 4,
  });
  return {
    pairId: 'me,partner',
    userA: member('me', 'Marko'),
    userB: member('partner', 'Ana'),
    games: 18,
    wins: 13,
    winRate: 72.2,
    combinedLevel: 4.5,
    chemistry: 9,
    lastPlayedAt: null,
    isViewerPair: true,
    teamId: null,
    recentGames: [
      {
        id: 'g1',
        name: 'Friday doubles',
        entityType: 'GAME',
        sport: 'PADEL' as PairDetail['recentGames'][number]['sport'],
        startTime: '2026-03-01T18:00:00.000Z',
        clubName: 'Center',
        won: true,
      },
    ],
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  navigate.mockClear();
  ensurePairTeam.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  queryData = null;
});

function render(data: PairDetail | null) {
  queryData = data;
  act(() => {
    root.render(<PairSheet pairId="me,partner" onClose={() => {}} />);
  });
}

describe('PairSheet (PRD 352)', () => {
  it('shows Create a team when the pair has no UserTeam', () => {
    render(detail());
    const action = container.querySelector('[data-testid="pair-sheet-team-action"]')!;
    expect(action.textContent).toContain('pairs.sheet.createTeam');
  });

  it('shows Open team when a UserTeam already exists', () => {
    render(detail({ teamId: 'team-7' }));
    const action = container.querySelector('[data-testid="pair-sheet-team-action"]')!;
    expect(action.textContent).toContain('pairs.sheet.openTeam');
  });

  it('creates the team with both members and navigates to it', async () => {
    render(detail());
    const action = container.querySelector<HTMLButtonElement>(
      '[data-testid="pair-sheet-team-action"]',
    )!;
    await act(async () => {
      action.click();
    });
    expect(ensurePairTeam).toHaveBeenCalledWith('me', 'partner', null);
    expect(navigate).toHaveBeenCalledWith('/user-team/team-new');
  });

  it('reuses the existing team id instead of creating a second one', async () => {
    render(detail({ teamId: 'team-7' }));
    const action = container.querySelector<HTMLButtonElement>(
      '[data-testid="pair-sheet-team-action"]',
    )!;
    await act(async () => {
      action.click();
    });
    expect(ensurePairTeam).toHaveBeenCalledWith('me', 'partner', 'team-7');
  });

  it('lists the recent games together with a result chip', () => {
    render(detail());
    const games = container.querySelectorAll('[data-testid="pair-recent-game"]');
    expect(games).toHaveLength(1);
    expect(games[0]!.textContent).toContain('pairs.result.win');
  });

  it('hides the team actions for a pair the viewer is not part of', () => {
    const other = detail();
    other.userA = { ...other.userA, id: 'someone' };
    other.userB = { ...other.userB, id: 'else' };
    render(other);
    expect(container.querySelector('[data-testid="pair-sheet-team-action"]')).toBeNull();
  });
});
