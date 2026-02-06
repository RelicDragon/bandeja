import { NavigateFunction, NavigateOptions } from 'react-router-dom';
import { findMatchingRoute } from '@/config/navigationRoutes';
import { useNavigationStore } from '@/store/navigationStore';

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
  /** When false (e.g. from Capacitor backButton event.canGoBack), skip history.back and use fallback */
  nativeCanGoBack?: boolean;
}

const SAFETY_CHECK_MS = 350;

const APP_PATH_RE =
  /^\/(find|chats|profile|leaderboard|games|create-game|create-league|rating|bugs|game-subscriptions|user-chat|group-chat|channel-chat|select-city|complete-profile|login|register|character)(\/.*)?$/;

const isAppPath = (pathname: string): boolean =>
  pathname === '/' || APP_PATH_RE.test(pathname);

/** Entry-point routes (direct URL, shared link, push). Never use history.back() — previous entry may be external (about:blank, google). */
const ENTRY_POINT_PATH_RE =
  /^\/(group-chat|user-chat|channel-chat|games)\/[^/]+(\/chat)?$|^\/bugs\/[^/]+\/chat$/;
const isEntryPointRoute = (pathname: string): boolean => ENTRY_POINT_PATH_RE.test(pathname);

/** Call from App when Capacitor. On iOS, swipe-back is WebView-native (history.back()); this redirects to home if we land on a non-app path. */
export const setupPopstateFallback = (navigate: NavigateFunction): (() => void) => {
  const handler = () => {
    const pathname = window.location.pathname || '';
    if (!isAppPath(pathname)) {
      useNavigationStore.getState().setCurrentPage('my');
      navigate('/', { replace: true });
    }
  };
  window.addEventListener('popstate', handler);
  return () => window.removeEventListener('popstate', handler);
};

const applyFallback = (
  params: HandleBackNavigationParams,
  fallback: string,
  matchedRoute: { setFilter?: 'users' | 'bugs' | 'channels' } | null
): void => {
  const { navigate, setCurrentPage, setChatsFilter } = params;
  if (matchedRoute?.setFilter && setChatsFilter) {
    setChatsFilter(matchedRoute.setFilter);
  }
  if (setCurrentPage) {
    if (fallback === '/') {
      setCurrentPage('my');
    } else if (fallback.includes('/games/')) {
      setCurrentPage('gameDetails');
    }
  }
  navigateWithTracking(navigate, fallback, { replace: true });
};

export const handleBackNavigation = (params: HandleBackNavigationParams): void => {
  const { pathname, locationState, navigate, setCurrentPage, setChatsFilter: _setChatsFilter, nativeCanGoBack } = params;
  const matchedRoute = findMatchingRoute(pathname);
  const fallback =
    matchedRoute
      ? typeof matchedRoute.fallback === 'function'
        ? matchedRoute.fallback(pathname, locationState)
        : matchedRoute.fallback
      : '/';

  const goToFallback = () => {
    if (matchedRoute) {
      if (import.meta.env.DEV) {
        console.log(`[handleBackNavigation] Navigating to fallback: ${fallback} (from: ${pathname})`);
      }
      applyFallback(params, fallback, matchedRoute);
    } else {
      if (import.meta.env.DEV) {
        console.log('[handleBackNavigation] No route matched, falling back to home');
      }
      setCurrentPage?.('my');
      navigateWithTracking(navigate, '/', { replace: true });
    }
  };

  if (nativeCanGoBack === false) {
    goToFallback();
    return;
  }
  if (isEntryPointRoute(pathname)) {
    goToFallback();
    return;
  }
  if (canNavigateBack()) {
    const previousPathname = pathname;
    try {
      navigate(-1);
    } catch (error) {
      console.error('[Navigation] Error navigating back:', error);
      goToFallback();
      return;
    }
    setTimeout(() => {
      const current = window.location.pathname;
      if (current === previousPathname || !isAppPath(current)) {
        goToFallback();
      }
    }, SAFETY_CHECK_MS);
    return;
  }

  goToFallback();
};

export const handleBackNavigationFromService = (
  navigate: NavigateFunction,
  nativeCanGoBack?: boolean
): void => {
  const pathname = window.location.pathname || '/';
  const state = window.history.state;
  const locationState = (state?.usr ?? state ?? null) as LocationState | null;
  const { setCurrentPage, setChatsFilter } = useNavigationStore.getState();
  handleBackNavigation({
    pathname,
    locationState,
    navigate,
    setCurrentPage,
    setChatsFilter,
    nativeCanGoBack,
  });
};
