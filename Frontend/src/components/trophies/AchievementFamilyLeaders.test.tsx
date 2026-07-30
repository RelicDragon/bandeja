// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

const { openPlayerCard, useLeaderboard } = vi.hoisted(() => ({
  openPlayerCard: vi.fn(),
  useLeaderboard: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/hooks/usePlayerCardModal', () => ({
  usePlayerCardModal: () => ({ openPlayerCard }),
}));

vi.mock('@/queries/useAchievementLeaderboardQuery', () => ({
  useAchievementLeaderboardQuery: useLeaderboard,
}));

vi.mock('@/components/PlayerAvatar', () => ({
  PlayerAvatar: ({ player }: { player: { id: string } }) => (
    <span data-testid={`avatar-${player.id}`} />
  ),
}));

import { AchievementFamilyLeaders } from './AchievementFamilyLeaders';

const leader = (rank: number) => ({
  id: `player-${rank}`,
  firstName: `Player${rank}`,
  lastName: 'Leader',
  rank,
  progress: 100 - rank,
});

describe('AchievementFamilyLeaders', () => {
  it('renders the global top three for the selected achievement family', () => {
    useLeaderboard.mockReturnValue({
      data: { leaderboard: [leader(1), leader(2), leader(3), leader(4)] },
      isPending: false,
      isError: false,
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <AchievementFamilyLeaders ruleKind="HABIT_FIRST_WIN" open />,
      );
    });

    expect(useLeaderboard).toHaveBeenCalledWith({
      family: 'HABIT_WINS',
      scope: 'global',
      gender: 'all',
    });
    expect(container.querySelectorAll('button')).toHaveLength(3);
    expect(container.textContent).toContain('P. Leader');
    expect(container.textContent).not.toContain('4');

    act(() => {
      container.querySelector<HTMLButtonElement>('button')!.click();
    });
    expect(openPlayerCard).toHaveBeenCalledWith('player-1');

    act(() => root.unmount());
    container.remove();
  });
});
