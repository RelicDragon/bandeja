import { NavigateFunction } from 'react-router-dom';
import { buildUrl, type PlaceParams } from '@/utils/urlSchema';

class NavigationService {
  private navigate: NavigateFunction | null = null;

  initialize(navigate: NavigateFunction) {
    this.navigate = navigate;
  }

  private ensureInitialized() {
    if (!this.navigate) {
      console.error('NavigationService not initialized. Call initialize() first.');
      return false;
    }
    return true;
  }

  navigateToGame(gameId: string, openChat: boolean = false) {
    if (!this.ensureInitialized() || !gameId) return;
    const place = openChat ? 'gameChat' : 'game';
    this.navigate!(buildUrl(place as any, { id: gameId }), { replace: true });
  }

  navigateToUserChat(userChatId: string) {
    if (!this.ensureInitialized() || !userChatId) return;
    this.navigate!(buildUrl('userChat', { id: userChatId }), { replace: true });
  }

  async navigateToBugChat(bugId: string) {
    if (!this.ensureInitialized() || !bugId) return;
    try {
      const { bugsApi } = await import('@/api');
      const res = await bugsApi.getBugById(bugId);
      const groupChannelId = res.data?.groupChannel?.id;
      if (groupChannelId) {
        this.navigate!(buildUrl('channelChat', { id: groupChannelId }), { replace: true });
      } else {
        this.navigate!(buildUrl('bugs'), { replace: true });
      }
    } catch {
      this.navigate!(buildUrl('bugs'), { replace: true });
    }
  }

  navigateToGroupChat(groupChannelId: string) {
    if (!this.ensureInitialized() || !groupChannelId) return;
    this.navigate!(buildUrl('groupChat', { id: groupChannelId }), { replace: true });
  }

  navigateToChannelChat(channelId: string) {
    if (!this.ensureInitialized() || !channelId) return;
    this.navigate!(buildUrl('channelChat', { id: channelId }), { replace: true });
  }

  navigateToBugsList() {
    if (!this.ensureInitialized()) return;
    this.navigate!(buildUrl('bugs'), { replace: true });
  }

  navigateToCreateBug() {
    if (!this.ensureInitialized()) return;
    this.navigate!(buildUrl('bugs', { create: '1' }), { replace: true });
  }

  navigateToCreateListing() {
    if (!this.ensureInitialized()) return;
    this.navigate!(buildUrl('createMarketItem'), { replace: true });
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
