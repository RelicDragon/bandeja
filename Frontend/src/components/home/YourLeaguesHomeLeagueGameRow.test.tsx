// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Game } from '@/types';

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (state: { user: null }) => unknown) => selector({ user: null }),
}));

vi.mock('@/hooks/useUnreadBridge', () => ({
  useContextUnread: () => 0,
}));

vi.mock('@/components/UnreadBadge', () => ({
  UnreadBadge: () => null,
}));

vi.mock('@/utils/leagueHomeGameMatchup', () => ({
  getLeagueHomeGameMatchup: () => null,
}));

vi.mock('./YourLeaguesHomeLeagueGameMatchup', () => ({
  YourLeaguesHomeLeagueGameMatchup: () => null,
}));

function leagueGame(partial: Partial<Game> & { id: string }): Game {
  return {
    entityType: 'LEAGUE',
    status: 'ANNOUNCED',
    startTime: '2026-01-01T12:00:00Z',
    endTime: '2026-01-01T14:00:00Z',
    timeIsSet: false,
    participants: [],
    createdAt: '',
    updatedAt: '',
    ...partial,
  } as Game;
}

describe('YourLeaguesHomeLeagueGameRow', () => {
  it('omits the round number for a playoff game', async () => {
    const { YourLeaguesHomeLeagueGameRow } = await import('./YourLeaguesHomeLeagueGameRow');
    const html = renderToStaticMarkup(
      <YourLeaguesHomeLeagueGameRow
        game={leagueGame({
          id: 'playoff-game',
          leagueGroup: { id: 'group-b', name: 'Group B' },
          leagueRound: {
            id: 'round-12',
            orderIndex: 11,
            roundType: 'PLAYOFF',
            playoffFormat: 'BRACKET',
            bracketScope: 'PER_GROUP',
          },
          bracketSlot: { slotKind: 'MAIN' },
        })}
        omitDatetimeNotSetLabel
        onClick={vi.fn()}
      />
    );

    expect(html).toContain('Knockout match');
    expect(html).toContain('Group B');
    expect(html).not.toContain('R12');
  });

  it('keeps the round number for a regular league game', async () => {
    const { YourLeaguesHomeLeagueGameRow } = await import('./YourLeaguesHomeLeagueGameRow');
    const html = renderToStaticMarkup(
      <YourLeaguesHomeLeagueGameRow
        game={leagueGame({
          id: 'regular-game',
          leagueGroup: { id: 'group-a', name: 'Group A' },
          leagueRound: {
            id: 'round-3',
            orderIndex: 2,
            roundType: 'REGULAR',
          },
        })}
        onClick={vi.fn()}
      />
    );

    expect(html).toContain('R3');
    expect(html).toContain('Group A');
  });
});
