import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useNavigationStore } from '@/store/navigationStore';
import { parseLocation, placeToPageType } from '@/utils/urlSchema';

/**
 * Syncs URL → navigationStore so existing consumers that read from the store
 * (activeTab, findViewMode, chatsFilter, marketplaceTab, currentPage)
 * continue to work while the URL is the single source of truth.
 */
export function useUrlStoreSync() {
  const location = useLocation();

  useEffect(() => {
    const state = useNavigationStore.getState();
    const parsed = parseLocation(location.pathname, location.search);
    const pageType = placeToPageType(parsed.place);

    state.setCurrentPage(pageType);

    switch (parsed.place) {
      case 'home': {
        const tab = (parsed.params.tab as string) || 'my-games';
        state.setActiveTab(tab as 'my-games' | 'past-games');
        break;
      }
      case 'find': {
        const view = (parsed.params.view as string) || 'calendar';
        state.setFindViewMode(view as 'calendar' | 'list');
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
