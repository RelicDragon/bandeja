import { NavigateFunction, NavigateOptions } from 'react-router-dom';
import { isAppPath, homeUrl } from './urlSchema';

export const markNavigation = (): void => {
  if (window.history.state) {
    window.history.replaceState(
      { 
        ...window.history.state, 
        isAppNavigation: true,
        timestamp: Date.now() 
      },
      ''
    );
  }
};

export interface LocationState {
  fromLeagueSeasonGameId?: string;
  leagueSeasonTab?: 'general' | 'schedule' | 'standings' | 'faq';
  fromPage?: 'my' | 'find' | 'chats' | 'bugs' | 'profile' | 'leaderboard' | 'gameDetails' | 'gameSubscriptions' | 'marketplace';
  fromFilter?: 'users' | 'bugs' | 'channels' | 'market';
  fromMarketplaceSubtab?: 'my' | 'market';
  searchQuery?: string;
  marketRole?: 'buyer' | 'seller';
  returnItemId?: string;
  isAppNavigation?: boolean;
  timestamp?: number;
}

export const navigateWithTracking = (
  navigate: NavigateFunction,
  path: string | number,
  options?: NavigateOptions & { state?: LocationState }
): void => {
  if (typeof path === 'number') {
    navigate(path);
  } else {
    navigate(path, {
      ...options,
      state: {
        ...options?.state,
        isAppNavigation: true,
        timestamp: Date.now(),
      },
    });
  }
  
  setTimeout(() => markNavigation(), 0);
};

export const setupPopstateFallback = (navigate: NavigateFunction): (() => void) => {
  const handler = () => {
    const pathname = window.location.pathname || '';
    if (!isAppPath(pathname)) {
      try {
        navigate(homeUrl(), { replace: true });
      } catch {
        window.location.replace(homeUrl());
      }
    }
  };
  window.addEventListener('popstate', handler);
  return () => window.removeEventListener('popstate', handler);
};
