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
  const store = useNavigationStore();

  useEffect(() => {
    const parsed = parseLocation(location.pathname, location.search);
    const pageType = placeToPageType(parsed.place);

    store.setCurrentPage(pageType);

    switch (parsed.place) {
      case 'home': {
        const tab = (parsed.params.tab as string) || 'my-games';
        store.setActiveTab(tab as 'my-games' | 'past-games');
        break;
      }
      case 'find': {
        const view = (parsed.params.view as string) || 'calendar';
        store.setFindViewMode(view as 'calendar' | 'list');
        break;
      }
      case 'chats': {
        const filterParam = new URLSearchParams(location.search).get('filter');
        store.setChatsFilter((filterParam === 'channels' ? 'channels' : 'users') as 'users' | 'channels');
        break;
      }
      case 'chatsMarketplace':
        store.setChatsFilter('market');
        break;
      case 'bugs':
        store.setChatsFilter('bugs');
        break;
      case 'userChat':
        store.setChatsFilter('users');
        break;
      case 'groupChat':
        store.setChatsFilter('users');
        break;
      case 'marketplace':
      case 'createMarketItem':
      case 'marketplaceItem':
        store.setMarketplaceTab('market');
        break;
      case 'marketplaceMy':
      case 'editMarketItem':
        store.setMarketplaceTab('my');
        break;
      default:
        break;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);
}
