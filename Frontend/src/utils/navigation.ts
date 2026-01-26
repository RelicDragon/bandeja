import { NavigateFunction, NavigateOptions } from 'react-router-dom';
import { findMatchingRoute } from '@/config/navigationRoutes';

export const markNavigation = (): void => {
  // Use History State API instead of sessionStorage
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
  
  // Mark current state
  setTimeout(() => markNavigation(), 0);
};

export const canNavigateBack = (): boolean => {
  // Check history length
  if (window.history.length <= 1) {
    return false;
  }
  
  // Check if current state has app navigation marker
  const state = window.history.state;
  if (!state) {
    return false;
  }
  
  // React Router stores user state in 'usr' property, check both locations
  const hasAppNavigation = state.isAppNavigation === true || state.usr?.isAppNavigation === true;
  
  if (!hasAppNavigation) {
    return false;
  }
  
  return true;
};

export interface LocationState {
  fromLeagueSeasonGameId?: string;
  fromPage?: 'my' | 'find' | 'chats' | 'bugs' | 'profile' | 'leaderboard' | 'gameDetails' | 'gameSubscriptions';
  isAppNavigation?: boolean;
  timestamp?: number;
}

type PageType = 'my' | 'find' | 'chats' | 'bugs' | 'profile' | 'leaderboard' | 'gameDetails' | 'gameSubscriptions';

interface HandleBackNavigationParams {
  pathname: string;
  locationState: LocationState | null;
  navigate: NavigateFunction;
  setCurrentPage?: (page: PageType) => void;
  setChatsFilter?: (filter: 'users' | 'bugs' | 'channels') => void;
  contextType?: 'USER' | 'BUG' | 'GAME' | 'GROUP';
  gameId?: string;
}

const navigateBackSafely = (navigate: NavigateFunction): void => {
  try {
    navigate(-1);
  } catch (error) {
    console.error('[Navigation] Error navigating back:', error);
    navigate('/', { replace: true });
  }
};

export const handleBackNavigation = (params: HandleBackNavigationParams): void => {
  const { pathname, locationState, navigate, setCurrentPage, setChatsFilter } = params;
  
  if (canNavigateBack()) {
    console.log('[handleBackNavigation] Using browser history: navigate(-1)');
    navigateBackSafely(navigate);
    return;
  }
  
  // Use declarative route configuration
  const matchedRoute = findMatchingRoute(pathname);
  
  if (matchedRoute) {
    const fallback = typeof matchedRoute.fallback === 'function'
      ? matchedRoute.fallback(pathname, locationState)
      : matchedRoute.fallback;
    
    // Set filter if specified
    if (matchedRoute.setFilter && setChatsFilter) {
      setChatsFilter(matchedRoute.setFilter);
    }
    
    // Update page state if needed
    if (setCurrentPage) {
      if (fallback === '/') {
        setCurrentPage('my');
      } else if (fallback.includes('/games/')) {
        setCurrentPage('gameDetails');
      }
    }
    
    console.log(`[handleBackNavigation] No history available. Navigating to: ${fallback} (from: ${pathname})`);
    navigateWithTracking(navigate, fallback, { replace: true });
    return;
  }
  
  // Ultimate fallback
  console.log('[handleBackNavigation] No route matched, falling back to home');
  setCurrentPage?.('my');
  navigateWithTracking(navigate, '/', { replace: true });
};
