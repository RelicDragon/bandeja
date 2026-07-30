// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (state: { user: { id: string } }) => unknown) =>
    selector({ user: { id: 'me' } }),
}));

vi.mock('@/queries/useFollowingAchievementEarnersQuery', () => ({
  useFollowingAchievementEarnersQuery: () => ({
    data: [
      {
        id: 'friend-1',
        firstName: 'Ana',
        lastName: 'Smith',
        level: 2.5,
        socialLevel: 2.5,
        gender: 'FEMALE',
        approvedLevel: false,
        isTrainer: false,
      },
      {
        id: 'friend-2',
        firstName: 'Bo',
        lastName: 'Jones',
        level: 3,
        socialLevel: 3,
        gender: 'MALE',
        approvedLevel: false,
        isTrainer: false,
      },
    ],
  }),
}));

vi.mock('@/hooks/usePlayerCardModal', () => ({
  usePlayerCardModal: () => ({ openPlayerCard: vi.fn() }),
}));

vi.mock('@/components/PlayerAvatar', () => ({
  PlayerAvatar: ({ player }: { player: { firstName: string } }) => (
    <span data-testid="avatar">{player.firstName[0]}</span>
  ),
}));

import { FollowingAchievementEarners } from './FollowingAchievementEarners';
import { queryKeys } from '@/queries/queryKeys';

describe('FollowingAchievementEarners', () => {
  it('isolates cached earners by signed-in viewer', () => {
    expect(queryKeys.followingAchievementEarners('viewer-a', 'dynamic_duo_10'))
      .not.toEqual(queryKeys.followingAchievementEarners('viewer-b', 'dynamic_duo_10'));
  });

  it('renders followed earners in one horizontal row', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <FollowingAchievementEarners definitionId="dynamic_duo_10" open />,
      );
    });

    const rail = container.querySelector('[data-testid="following-achievement-earners-rail"]');
    expect(container.querySelectorAll('[data-testid="avatar"]')).toHaveLength(2);
    expect(container.textContent).toContain('A. Smith');
    expect(container.textContent).toContain('B. Jones');
    expect(rail?.className).toContain('overflow-x-auto');
    expect(rail?.className).toContain('px-1');
    expect(container.querySelector('button[aria-label="Ana Smith"]')).not.toBeNull();
    expect(container.querySelector('button span:last-child')?.className).toContain('truncate');

    Object.defineProperties(rail!, {
      clientWidth: { configurable: true, value: 200 },
      scrollWidth: { configurable: true, value: 400 },
      scrollLeft: { configurable: true, value: 0, writable: true },
    });
    act(() => rail!.dispatchEvent(new Event('scroll', { bubbles: true })));
    expect(container.querySelector('[data-testid="following-achievement-earners-right-fade"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="following-achievement-earners-left-fade"]')).toBeNull();

    (rail as HTMLDivElement).scrollLeft = 100;
    act(() => rail!.dispatchEvent(new Event('scroll', { bubbles: true })));
    expect(container.querySelector('[data-testid="following-achievement-earners-left-fade"]')).not.toBeNull();

    act(() => root.unmount());
    container.remove();
  });
});
