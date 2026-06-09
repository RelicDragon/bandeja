import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useShellNavStore } from '@/store/shellNavStore';
import { parseLocation } from '@/utils/urlSchema';

export type HomeSubTab = 'calendar' | 'past-games';

export function homeSubTabFromParams(tab: string | undefined): HomeSubTab {
  if (tab === 'past-games') return tab;
  return 'calendar';
}

/**
 * Syncs URL → shellNavStore so consumers that read tab/filter state from the store
 * continue to work while the URL is the single source of truth.
 */
export function useUrlStoreSync() {
  const location = useLocation();

  useEffect(() => {
    const state = useShellNavStore.getState();
    const parsed = parseLocation(location.pathname, location.search);

    switch (parsed.place) {
      case 'home': {
        state.setActiveTab(homeSubTabFromParams(parsed.params.tab as string | undefined));
        break;
      }
      case 'find': {
        const view = (parsed.params.view as string) || 'calendar';
        state.setFindViewMode(view as 'calendar' | 'list');
        const rawTab = (parsed.params.tab as string) || 'my-games';
        const findTab = ['my-games', 'past-games', 'search'].includes(rawTab) ? rawTab : 'my-games';
        state.setActiveTab(findTab as 'my-games' | 'past-games' | 'search');
        break;
      }
      case 'chats': {
        const filterParam = new URLSearchParams(location.search).get('filter');
        state.setChatsFilter((filterParam === 'channels' ? 'channels' : 'users') as 'users' | 'channels');
        break;
      }
      case 'chatsMarketplace':
        state.setChatsFilter('market');
        break;
      case 'bugs':
        state.setChatsFilter('bugs');
        break;
      case 'userChat':
        state.setChatsFilter('users');
        break;
      case 'groupChat':
        state.setChatsFilter('users');
        break;
      case 'channelChat': {
        const fp = new URLSearchParams(location.search).get('filter');
        state.setChatsFilter(fp === 'market' ? 'market' : 'channels');
        break;
      }
      case 'marketplace':
      case 'createMarketItem':
      case 'marketplaceItem':
        state.setMarketplaceTab('market');
        break;
      case 'marketplaceMy':
      case 'editMarketItem':
        state.setMarketplaceTab('my');
        break;
      default:
        break;
    }
  }, [location.pathname, location.search]);
}
