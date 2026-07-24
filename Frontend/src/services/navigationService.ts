import { NavigateFunction } from 'react-router-dom';
import { buildUrl, type PlaceParams } from '@/utils/urlSchema';
import { useGameDetailsChromeStore } from '@/components/GameDetails/gameDetailsChromeStore';
import type { ChatNavigateOptions } from '@/pages/GameChat/types';
import { bumpChatFreshOpenNonce } from '@/services/chat/chatOpenEntry';

function chatNavigationState(opts?: ChatNavigateOptions) {
  if (!opts?.forceReload && !opts?.anchorMessageId && !opts?.initialChatType) {
    return undefined;
  }
  if (opts.forceReload) bumpChatFreshOpenNonce();
  return {
    ...(opts.initialChatType ? { initialChatType: opts.initialChatType } : {}),
    ...(opts.forceReload ? { forceReload: Date.now() } : {}),
    ...(opts.anchorMessageId ? { anchorMessageId: opts.anchorMessageId } : {}),
  };
}

class NavigationService {
  private navigate: NavigateFunction | null = null;

  initialize(navigate: NavigateFunction) {
    this.navigate = navigate;
  }

  isReady(): boolean {
    return this.navigate != null;
  }

  private ensureInitialized() {
    if (!this.navigate) {
      console.error('NavigationService not initialized. Call initialize() first.');
      return false;
    }
    return true;
  }

  navigateToGame(gameId: string, openChat: boolean = false, opts?: ChatNavigateOptions | string) {
    if (!this.ensureInitialized() || !gameId) return;
    const place = openChat ? 'gameChat' : 'game';
    const navOpts: ChatNavigateOptions | undefined =
      typeof opts === 'string' ? { initialChatType: opts } : opts;
    const state = openChat ? chatNavigationState(navOpts) : undefined;
    const replace = navOpts?.replace !== false;
    this.navigate!(buildUrl(place as any, { id: gameId }), { replace, state });
  }

  navigateToLeagueSeasonSchedule(
    leagueSeasonId: string,
    options?: { subtab?: string; group?: string; roundId?: string }
  ) {
    if (!this.ensureInitialized() || !leagueSeasonId) return;
    const sp = new URLSearchParams();
    sp.set('tab', 'schedule');
    if (options?.subtab) sp.set('subtab', options.subtab);
    if (options?.roundId) {
      sp.set('roundId', options.roundId);
      sp.set('round', options.roundId);
    }
    if (options?.group) sp.set('group', options.group);
    this.navigate!(`/games/${leagueSeasonId}?${sp.toString()}`, { replace: true });
  }

  navigateToUserChat(userChatId: string, opts?: ChatNavigateOptions) {
    if (!this.ensureInitialized() || !userChatId) return;
    this.navigate!(buildUrl('userChat', { id: userChatId }), {
      replace: opts?.replace !== false,
      state: chatNavigationState({ forceReload: true, ...opts }),
    });
  }

  navigateToUserTeam(teamId: string) {
    if (!this.ensureInitialized() || !teamId) return;
    this.navigate!(buildUrl('userTeam', { id: teamId }), { replace: true });
  }

  async navigateToBugChat(bugId: string, opts?: ChatNavigateOptions) {
    if (!this.ensureInitialized() || !bugId) return;
    const replace = opts?.replace !== false;
    try {
      const { bugsApi } = await import('@/api');
      const res = await bugsApi.getBugById(bugId);
      const groupChannelId = res.data?.groupChannel?.id;
      if (groupChannelId) {
        this.navigate!(buildUrl('bugs', { id: groupChannelId }), {
          replace,
          state: chatNavigationState({ forceReload: true, ...opts }),
        });
      } else {
        this.navigate!(buildUrl('bugs'), { replace });
      }
    } catch {
      this.navigate!(buildUrl('bugs'), { replace });
    }
  }

  navigateToGroupChat(groupChannelId: string, opts?: ChatNavigateOptions) {
    if (!this.ensureInitialized() || !groupChannelId) return;
    this.navigate!(buildUrl('groupChat', { id: groupChannelId }), {
      replace: opts?.replace !== false,
      state: chatNavigationState({ forceReload: true, ...opts }),
    });
  }

  navigateToChannelChat(channelId: string, opts?: ChatNavigateOptions) {
    if (!this.ensureInitialized() || !channelId) return;
    const params: PlaceParams = { id: channelId };
    if (opts?.filter === 'market') params.filter = 'market';
    this.navigate!(buildUrl('channelChat', params), {
      replace: opts?.replace !== false,
      state: chatNavigationState({ forceReload: true, ...opts }),
    });
  }

  navigateToBugsList() {
    if (!this.ensureInitialized()) return;
    this.navigate!(buildUrl('bugs'), { replace: true });
  }

  navigateToCreateBug() {
    if (!this.ensureInitialized()) return;
    useGameDetailsChromeStore.getState().setOpenBugModal(true);
    this.navigate!(buildUrl('bugs'), { replace: true });
  }

  navigateToCreateListing() {
    if (!this.ensureInitialized()) return;
    this.navigate!(buildUrl('createMarketItem'), { replace: true });
  }

  navigateToHome() {
    if (!this.ensureInitialized()) return;
    this.navigate!(buildUrl('home'), { replace: true });
  }

  navigateToFind(params?: PlaceParams) {
    if (!this.ensureInitialized()) return;
    this.navigate!(buildUrl('find', params), { replace: true });
  }

  navigateToMarketplace(params?: PlaceParams) {
    if (!this.ensureInitialized()) return;
    this.navigate!(buildUrl('marketplace', params), { replace: true });
  }
}

export const navigationService = new NavigationService();
