import { NavigateFunction } from 'react-router-dom';
import { useNavigationStore } from '@/store/navigationStore';

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
    store.setCurrentPage('gameDetails');
    
    const path = openChat ? `/games/${gameId}/chat` : `/games/${gameId}`;
    this.navigate!(path, { replace: true });
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
    this.navigate!(`/user-chat/${userChatId}`, { replace: true });
  }

  navigateToBugChat(bugId: string) {
    if (!this.ensureInitialized() || !bugId) {
      console.error('Cannot navigate to bug chat: invalid bugId or service not initialized');
      return;
    }

    const store = this.getStore();
    if (!store) return;

    this.setAnimatingState();
    store.setCurrentPage('chats');
    store.setChatsFilter('bugs');
    this.navigate!(`/bugs/${bugId}/chat`, { replace: true });
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
    store.setChatsFilter('channels');
    this.navigate!(`/group-chat/${groupChannelId}`, { replace: true });
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
    this.navigate!('/bugs', { replace: true });
  }
}

export const navigationService = new NavigationService();
