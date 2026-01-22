import { NavigateFunction } from 'react-router-dom';
import { isCapacitor } from './capacitor';

const NAVIGATION_TRACK_KEY = 'app_navigation_tracked';

export const markNavigation = (): void => {
  sessionStorage.setItem(NAVIGATION_TRACK_KEY, 'true');
};

export const canNavigateBack = (): boolean => {
  if (window.history.length <= 1) {
    console.log('[canNavigateBack] History length <= 1, returning false');
    return false;
  }
  
  const hasNavigatedWithinApp = sessionStorage.getItem(NAVIGATION_TRACK_KEY) === 'true';
  
  if (!hasNavigatedWithinApp) {
    console.log('[canNavigateBack] No navigation tracking, returning false');
    return false;
  }
  
  const isNativeApp = isCapacitor();
  
  if (isNativeApp) {
    // In Capacitor apps, referrer might be empty, but if we have navigation tracking
    // and history length > 1, it's safe to navigate back within the app
    console.log('[canNavigateBack] Capacitor app detected, using navigation tracking only');
    return true;
  }
  
  // For web browsers, check referrer to ensure we're not going to browser pages
  const referrer = document.referrer;
  if (!referrer) {
    console.log('[canNavigateBack] No referrer, returning false');
    return false;
  }
  
  try {
    const referrerUrl = new URL(referrer);
    const currentUrl = new URL(window.location.href);
    
    if (referrerUrl.origin !== currentUrl.origin) {
      console.log(`[canNavigateBack] Referrer origin (${referrerUrl.origin}) !== current origin (${currentUrl.origin}), returning false`);
      return false;
    }
    
    // Check for browser-specific pages (chrome://, about:, etc.)
    if (referrerUrl.protocol === 'chrome:' || referrerUrl.protocol === 'about:' || referrerUrl.href === 'about:blank' || referrerUrl.href.includes('new-tab-page')) {
      console.log(`[canNavigateBack] Referrer is browser page (${referrerUrl.href}), returning false`);
      return false;
    }
  } catch (error) {
    console.log(`[canNavigateBack] Error parsing referrer: ${error}, returning false`);
    return false;
  }
  
  console.log('[canNavigateBack] All checks passed, returning true');
  return true;
};

interface LocationState {
  fromLeagueSeasonGameId?: string;
}

interface HandleBackNavigationParams {
  pathname: string;
  locationState: LocationState | null;
  navigate: NavigateFunction;
  setCurrentPage?: (page: string) => void;
  setChatsFilter?: (filter: 'users' | 'bugs' | 'channels') => void;
  contextType?: 'USER' | 'BUG' | 'GAME' | 'GROUP';
  gameId?: string;
}

export const handleBackNavigation = (params: HandleBackNavigationParams): void => {
  const { pathname, locationState, navigate, setCurrentPage, setChatsFilter, contextType, gameId } = params;
  
  if (canNavigateBack()) {
    console.log('[handleBackNavigation] Using browser history: navigate(-1)');
    (navigate as any)(-1);
    return;
  }
  
  let targetPath = '';
  
  if (contextType === 'BUG' || (pathname.includes('/bugs/') && pathname.includes('/chat'))) {
    targetPath = '/bugs';
    navigate('/bugs', { replace: true });
  } else if (contextType === 'USER' || pathname.includes('/user-chat/')) {
    if (setChatsFilter) {
      setChatsFilter('users');
    }
    targetPath = '/chats (users filter)';
    navigate('/chats', { replace: true });
  } else if (contextType === 'GROUP' || pathname.includes('/group-chat/') || pathname.includes('/channel-chat/')) {
    if (setChatsFilter) {
      setChatsFilter('channels');
    }
    targetPath = '/chats (channels filter)';
    navigate('/chats', { replace: true });
  } else if (contextType === 'GAME' || (pathname.includes('/games/') && pathname.includes('/chat'))) {
    const id = gameId || pathname.match(/\/games\/([^/]+)\/chat/)?.[1];
    if (id) {
      targetPath = `/games/${id}`;
      navigate(`/games/${id}`, { replace: true });
    } else {
      targetPath = '/';
      navigate('/', { replace: true });
    }
  } else if (pathname.match(/^\/games\/[^/]+$/)) {
    if (locationState?.fromLeagueSeasonGameId) {
      if (setCurrentPage) {
        setCurrentPage('gameDetails');
      }
      targetPath = `/games/${locationState.fromLeagueSeasonGameId} (from league)`;
      navigate(`/games/${locationState.fromLeagueSeasonGameId}`, { replace: true });
    } else {
      if (setCurrentPage) {
        setCurrentPage('my');
      }
      targetPath = '/';
      navigate('/', { replace: true });
    }
  } else if (locationState?.fromLeagueSeasonGameId) {
    if (setCurrentPage) {
      setCurrentPage('gameDetails');
    }
    targetPath = `/games/${locationState.fromLeagueSeasonGameId} (from league)`;
    navigate(`/games/${locationState.fromLeagueSeasonGameId}`, { replace: true });
  } else {
    if (setCurrentPage) {
      setCurrentPage('my');
    }
    targetPath = '/';
    navigate('/', { replace: true });
  }
  
  console.log(`[handleBackNavigation] No history available. Navigating to: ${targetPath} (from: ${pathname}, contextType: ${contextType || 'none'})`);
};
