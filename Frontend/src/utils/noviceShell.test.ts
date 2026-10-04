import { describe, expect, it } from 'vitest';
import type { BottomTabId } from '@/utils/bottomTabActiveId';
import {
  createMenuNoviceEntries,
  filterNoviceBottomTabs,
  myTabNoviceSections,
  rendersNoviceWelcome,
  showsNoviceWelcome,
} from './noviceShell';

const ALL_TABS: { id: BottomTabId }[] = [
  { id: 'my' },
  { id: 'find' },
  { id: 'chats' },
  { id: 'marketplace' },
  { id: 'leaderboard' },
];

const novice = (rank: number) => ({ noviceRank: rank, noviceCountedGames: rank, noviceUnlockedAllAt: null });
const tabIds = (user: Parameters<typeof filterNoviceBottomTabs>[0]) =>
  filterNoviceBottomTabs(user, ALL_TABS).map((tab) => tab.id);

describe('novice bottom tabs per rank', () => {
  it('reveals tabs rank by rank', () => {
    expect(tabIds(novice(0))).toEqual([]);
    expect(tabIds(novice(1))).toEqual(['my', 'find']);
    expect(tabIds(novice(2))).toEqual(['my', 'find', 'chats']);
    expect(tabIds(novice(3))).toEqual(['my', 'find', 'chats', 'leaderboard']);
    expect(tabIds(novice(4))).toEqual(['my', 'find', 'chats', 'marketplace', 'leaderboard']);
    expect(tabIds(novice(5))).toEqual(ALL_TABS.map((tab) => tab.id));
  });

  it('shows every tab after unlock-all and for payloads without novice fields', () => {
    expect(tabIds({ ...novice(0), noviceUnlockedAllAt: '2026-10-05T00:00:00.000Z' })).toHaveLength(5);
    expect(tabIds({})).toHaveLength(5);
    expect(tabIds(null)).toHaveLength(5);
  });
});

describe('novice Welcome page', () => {
  it('is the home only for a Newcomer in novice mode', () => {
    expect(showsNoviceWelcome(novice(0))).toBe(true);
    expect(showsNoviceWelcome(novice(1))).toBe(false);
    expect(showsNoviceWelcome({ ...novice(0), noviceUnlockedAllAt: '2026-10-05T00:00:00.000Z' })).toBe(false);
    expect(showsNoviceWelcome({})).toBe(false);
    expect(showsNoviceWelcome(undefined)).toBe(false);
  });
});

describe('deep links while novice', () => {
  it('swaps only the plain home route; every other route renders normally', () => {
    const user = novice(0);
    expect(rendersNoviceWelcome('home', '', user)).toBe(true);
    expect(rendersNoviceWelcome('home', '?focus=invites', user)).toBe(true);
    expect(rendersNoviceWelcome('home', '?tab=ai', user)).toBe(false);
    expect(rendersNoviceWelcome('home', '?tab=past-games', user)).toBe(false);
    for (const place of ['find', 'game', 'gameChat', 'userChat', 'chats', 'leaderboard', 'marketplace', 'profile', 'userProfile', 'club']) {
      expect(rendersNoviceWelcome(place, '', user)).toBe(false);
    }
    expect(rendersNoviceWelcome('home', '', novice(1))).toBe(false);
  });
});

describe('My tab sections per rank', () => {
  it('keeps ads hidden for the whole of novice mode', () => {
    for (const rank of [0, 1, 2, 3, 4]) {
      expect(myTabNoviceSections(novice(rank)).ads).toBe(false);
    }
    expect(myTabNoviceSections(novice(5)).ads).toBe(true);
    expect(myTabNoviceSections({ ...novice(2), noviceUnlockedAllAt: '2026-10-05' }).ads).toBe(true);
  });

  it('reveals calendar / past games at Debut and the busy rails at Challenger', () => {
    expect(myTabNoviceSections(novice(1))).toEqual({
      stories: false,
      ads: false,
      liveRail: false,
      calendar: true,
      pastGames: true,
      userTeams: false,
      leagues: false,
      aiAssistant: false,
      progressCard: true,
    });
    expect(myTabNoviceSections(novice(4))).toMatchObject({
      stories: true,
      liveRail: true,
      userTeams: true,
      leagues: true,
      aiAssistant: false,
      ads: false,
      progressCard: true,
    });
  });

  it('shows everything and no progress card once Regular', () => {
    expect(Object.values(myTabNoviceSections(novice(5))).filter((v) => v === false)).toEqual([false]);
    expect(myTabNoviceSections(novice(5)).progressCard).toBe(false);
  });
});

describe('create menu per rank', () => {
  it('hides game creation before Rookie and leagues / tournaments before Regular', () => {
    expect(createMenuNoviceEntries(novice(1))).toEqual({
      game: false,
      tournament: false,
      league: false,
      story: false,
      chats: false,
      team: false,
      listing: false,
    });
    expect(createMenuNoviceEntries(novice(2))).toMatchObject({ game: true, chats: true, league: false });
    expect(createMenuNoviceEntries(novice(4))).toMatchObject({
      story: true,
      team: true,
      listing: true,
      tournament: false,
      league: false,
    });
    expect(Object.values(createMenuNoviceEntries(novice(5))).every(Boolean)).toBe(true);
  });
});
