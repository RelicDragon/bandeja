/**
 * PRD 358 — novice-mode shell gating: which navigation entry points show for a
 * user. Pure (no React) so the rules are unit-testable per rank.
 *
 * Gating only hides entry points. A route is never blocked by novice rank
 * (`docs/product/constraints.md`): a deep link to a locked tab still renders.
 */
import {
  hasNoviceFeature,
  isNoviceModeActive,
  type NoviceFeature,
  type NoviceUserFields,
} from '@shared/novice';
import type { BottomTabId } from '@/utils/bottomTabActiveId';

type NoviceUser = NoviceUserFields | null | undefined;

/** Bottom tab → the novice feature that reveals it. */
export const BOTTOM_TAB_NOVICE_FEATURE: Readonly<Record<BottomTabId, NoviceFeature>> = {
  my: 'homeShell',
  find: 'findTab',
  chats: 'chatsTab',
  marketplace: 'marketTab',
  leaderboard: 'topTab',
};

/**
 * Newcomer in novice mode: the home route renders the full-screen Welcome page
 * instead of the My tab, and the shell shows no bottom tab bar.
 */
export function showsNoviceWelcome(user: NoviceUser): boolean {
  return isNoviceModeActive(user) && !hasNoviceFeature(user, 'homeShell');
}

/**
 * The shell swaps in the Welcome page only for the plain home route (`/`,
 * no `?tab=`). Every other place — Find, chats, a game, a profile, `/?tab=ai`
 * — renders as usual, so links, pushes and invites always open their screen.
 */
export function rendersNoviceWelcome(place: string, search: string, user: NoviceUser): boolean {
  if (place !== 'home') return false;
  if (new URLSearchParams(search).get('tab')) return false;
  return showsNoviceWelcome(user);
}

export function isBottomTabUnlocked(user: NoviceUser, tab: BottomTabId): boolean {
  return hasNoviceFeature(user, BOTTOM_TAB_NOVICE_FEATURE[tab]);
}

/** Filters a tab list down to the tabs this user's rank reveals (order kept). */
export function filterNoviceBottomTabs<T extends { id: BottomTabId }>(
  user: NoviceUser,
  tabs: readonly T[],
): T[] {
  return tabs.filter((tab) => isBottomTabUnlocked(user, tab.id));
}

/** Which My-tab sections show. The Play hero, invites and games always do. */
export type MyTabNoviceSections = {
  stories: boolean;
  ads: boolean;
  liveRail: boolean;
  calendar: boolean;
  pastGames: boolean;
  userTeams: boolean;
  leagues: boolean;
  aiAssistant: boolean;
  /** Compact rank progress card at the top of My. */
  progressCard: boolean;
};

export function myTabNoviceSections(user: NoviceUser): MyTabNoviceSections {
  return {
    stories: hasNoviceFeature(user, 'stories'),
    ads: hasNoviceFeature(user, 'ads'),
    liveRail: hasNoviceFeature(user, 'liveRail'),
    calendar: hasNoviceFeature(user, 'calendar'),
    pastGames: hasNoviceFeature(user, 'pastGames'),
    userTeams: hasNoviceFeature(user, 'userTeams'),
    leagues: hasNoviceFeature(user, 'leagues'),
    aiAssistant: hasNoviceFeature(user, 'aiAssistant'),
    progressCard: isNoviceModeActive(user),
  };
}

/** Header create menu entries. Bug reports and trainer trainings always show. */
export type CreateMenuNoviceEntries = {
  game: boolean;
  tournament: boolean;
  league: boolean;
  story: boolean;
  chats: boolean;
  team: boolean;
  listing: boolean;
};

export function createMenuNoviceEntries(user: NoviceUser): CreateMenuNoviceEntries {
  return {
    game: hasNoviceFeature(user, 'createGame'),
    tournament: hasNoviceFeature(user, 'tournaments') && hasNoviceFeature(user, 'createLeague'),
    league: hasNoviceFeature(user, 'leagues') && hasNoviceFeature(user, 'createLeague'),
    story: hasNoviceFeature(user, 'stories'),
    chats: hasNoviceFeature(user, 'chatsTab'),
    team: hasNoviceFeature(user, 'userTeams'),
    listing: hasNoviceFeature(user, 'marketTab'),
  };
}

/** False while every create entry except Bug is still locked — the header hides "+" then. */
export function hasNoviceCreateEntries(user: NoviceUser): boolean {
  return Object.values(createMenuNoviceEntries(user)).some(Boolean);
}
