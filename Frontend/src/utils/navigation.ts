import { NavigateFunction } from 'react-router-dom';

const NAVIGATION_TRACK_KEY = 'app_navigation_tracked';

export const markNavigation = (): void => {
  sessionStorage.setItem(NAVIGATION_TRACK_KEY, 'true');
};

export const canNavigateBack = (): boolean => {
  if (window.history.length <= 1) {
    return false;
  }
  
  const hasNavigatedWithinApp = sessionStorage.getItem(NAVIGATION_TRACK_KEY) === 'true';
  
  if (!hasNavigatedWithinApp) {
    return false;
  }
  
  return true;
};

interface LocationState {
  fromLeagueSeasonGameId?: string;
  fromPage?: 'my' | 'find' | 'chats' | 'bugs' | 'profile' | 'leaderboard' | 'gameDetails' | 'gameSubscriptions';
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
    } else if (locationState?.fromPage) {
      const fromPage = locationState.fromPage;
      if (setCurrentPage) {
        setCurrentPage(fromPage);
      }
      if (fromPage === 'find') {
        targetPath = '/find';
        navigate('/find', { replace: true });
      } else if (fromPage === 'chats') {
        targetPath = '/chats';
        navigate('/chats', { replace: true });
      } else if (fromPage === 'bugs') {
        targetPath = '/bugs';
        navigate('/bugs', { replace: true });
      } else if (fromPage === 'profile') {
        targetPath = '/profile';
        navigate('/profile', { replace: true });
      } else if (fromPage === 'leaderboard') {
        targetPath = '/leaderboard';
        navigate('/leaderboard', { replace: true });
      } else {
        targetPath = '/';
        navigate('/', { replace: true });
      }
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
  } else if (locationState?.fromPage) {
    const fromPage = locationState.fromPage;
    if (setCurrentPage) {
      setCurrentPage(fromPage);
    }
    if (fromPage === 'find') {
      targetPath = '/find';
      navigate('/find', { replace: true });
    } else if (fromPage === 'chats') {
      targetPath = '/chats';
      navigate('/chats', { replace: true });
    } else if (fromPage === 'bugs') {
      targetPath = '/bugs';
      navigate('/bugs', { replace: true });
    } else if (fromPage === 'profile') {
      targetPath = '/profile';
      navigate('/profile', { replace: true });
    } else if (fromPage === 'leaderboard') {
      targetPath = '/leaderboard';
      navigate('/leaderboard', { replace: true });
    } else {
      targetPath = '/';
      navigate('/', { replace: true });
    }
  } else {
    if (setCurrentPage) {
      setCurrentPage('my');
    }
    targetPath = '/';
    navigate('/', { replace: true });
  }
  
  console.log(`[handleBackNavigation] No history available. Navigating to: ${targetPath} (from: ${pathname}, contextType: ${contextType || 'none'})`);
};
