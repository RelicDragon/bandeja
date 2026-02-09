import { NavigateFunction } from 'react-router-dom';
import { useNavigationStore } from '@/store/navigationStore';
import { navigateWithTracking } from '@/utils/navigation';

type NavigationStore = ReturnType<typeof useNavigationStore.getState>;

class NavigationService {
  private navigate: NavigateFunction | null = null;

  initialize(navigate: NavigateFunction) {
    this.navigate = navigate;
  }

  private getStore(): NavigationStore | null {
    try {
      return useNavigationStore.getState();
    } catch {
      return null;
    }
  }

  private ensureInitialized() {
    if (!this.navigate) {
      console.error('NavigationService not initialized. Call initialize() first.');
      return false;
    }
    return true;
  }

  private setAnimatingState() {
    const store = this.getStore();
    if (!store) return;
    store.setIsAnimating(true);
    setTimeout(() => {
      const currentStore = this.getStore();
      if (currentStore) {
        currentStore.setIsAnimating(false);
      }
    }, 300);
  }

  navigateToGame(gameId: string, openChat: boolean = false) {
    if (!this.ensureInitialized() || !gameId) {
      console.error('Cannot navigate to game: invalid gameId or service not initialized');
      return;
    }

    const store = this.getStore();
    if (!store) return;

    this.setAnimatingState();
    const previousPage = store.currentPage;
    store.setCurrentPage('gameDetails');
    
    const path = openChat ? `/games/${gameId}/chat` : `/games/${gameId}`;
    navigateWithTracking(this.navigate!, path, { replace: true, state: { fromPage: previousPage } });
  }

  navigateToUserChat(userChatId: string) {
    if (!this.ensureInitialized() || !userChatId) {
      console.error('Cannot navigate to user chat: invalid userChatId or service not initialized');
      return;
    }

    const store = this.getStore();
    if (!store) return;

    this.setAnimatingState();
    store.setCurrentPage('chats');
    store.setChatsFilter('users');
    navigateWithTracking(this.navigate!, `/user-chat/${userChatId}`, { replace: true });
  }

  async navigateToBugChat(bugId: string) {
    if (!this.ensureInitialized() || !bugId) {
      console.error('Cannot navigate to bug chat: invalid bugId or service not initialized');
      return;
    }

    const store = this.getStore();
    if (!store) return;

    this.setAnimatingState();
    store.setCurrentPage('chats');
    store.setChatsFilter('bugs');
    try {
      const { bugsApi } = await import('@/api');
      const res = await bugsApi.getBugById(bugId);
      const groupChannelId = res.data?.groupChannel?.id;
      if (groupChannelId) {
        useNavigationStore.getState().setChatsFilter('bugs');
        navigateWithTracking(this.navigate!, `/channel-chat/${groupChannelId}`, { replace: true });
      } else {
        useNavigationStore.getState().setChatsFilter('bugs');
        navigateWithTracking(this.navigate!, '/chats', { replace: true });
      }
    } catch {
      useNavigationStore.getState().setChatsFilter('bugs');
      navigateWithTracking(this.navigate!, '/chats', { replace: true });
    }
  }

  navigateToGroupChat(groupChannelId: string) {
    if (!this.ensureInitialized() || !groupChannelId) {
      console.error('Cannot navigate to group chat: invalid groupChannelId or service not initialized');
      return;
    }

    const store = this.getStore();
    if (!store) return;

    this.setAnimatingState();
    store.setCurrentPage('chats');
    store.setChatsFilter('users');
    navigateWithTracking(this.navigate!, `/group-chat/${groupChannelId}`, { replace: true });
  }

  navigateToChannelChat(channelId: string, fromPage?: 'marketplace' | 'bugs' | 'chats') {
    if (!this.ensureInitialized() || !channelId) {
      console.error('Cannot navigate to channel chat: invalid channelId or service not initialized');
      return;
    }

    const store = this.getStore();
    if (!store) return;

    this.setAnimatingState();
    store.setCurrentPage('chats');
    store.setChatsFilter(fromPage === 'bugs' ? 'bugs' : 'channels');
    navigateWithTracking(this.navigate!, `/channel-chat/${channelId}`, {
      replace: true,
      state: fromPage ? { fromPage } : undefined
    });
  }

  navigateToBugsList() {
    if (!this.ensureInitialized()) {
      console.error('Cannot navigate to bugs list: service not initialized');
      return;
    }

    const store = this.getStore();
    if (!store) return;

    this.setAnimatingState();
    store.setCurrentPage('chats');
    store.setChatsFilter('bugs');
    navigateWithTracking(this.navigate!, '/bugs', { replace: true });
  }

  navigateToCreateBug() {
    if (!this.ensureInitialized()) {
      console.error('Cannot navigate to create bug: service not initialized');
      return;
    }

    const store = this.getStore();
    if (!store) return;

    this.setAnimatingState();
    store.setCurrentPage('chats');
    store.setChatsFilter('bugs');
    store.setOpenBugModal(true);
    navigateWithTracking(this.navigate!, '/bugs', { replace: true });
  }

  navigateToCreateListing() {
    if (!this.ensureInitialized()) {
      console.error('Cannot navigate to create listing: service not initialized');
      return;
    }

    const store = this.getStore();
    if (!store) return;

    this.setAnimatingState();
    store.setCurrentPage('marketplace');
    navigateWithTracking(this.navigate!, '/marketplace/create', { replace: true });
  }
}

export const navigationService = new NavigationService();
