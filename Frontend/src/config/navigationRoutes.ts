import { LocationState } from '@/utils/navigation';

export interface RouteConfig {
  pattern: RegExp;
  fallback: string | ((pathname: string, state: LocationState | null) => string);
  contextType?: 'USER' | 'BUG' | 'GAME' | 'GROUP';
  setFilter?: 'users' | 'bugs' | 'channels';
  priority: number;
}

export const navigationRoutes: RouteConfig[] = [
  // Bug chat routes
  {
    pattern: /^\/bugs\/[^/]+\/chat$/,
    fallback: '/bugs',
    contextType: 'BUG',
    priority: 10,
  },
  
  // User chat routes
  {
    pattern: /^\/user-chat\/[^/]+$/,
    fallback: '/chats',
    contextType: 'USER',
    setFilter: 'users',
    priority: 10,
  },
  
  // Group chat routes
  {
    pattern: /^\/group-chat\/[^/]+$/,
    fallback: '/chats',
    contextType: 'GROUP',
    setFilter: 'channels',
    priority: 10,
  },
  
  // Channel chat routes
  {
    pattern: /^\/channel-chat\/[^/]+$/,
    fallback: '/chats',
    contextType: 'GROUP',
    setFilter: 'channels',
    priority: 10,
  },
  
  // Game chat routes
  {
    pattern: /^\/games\/([^/]+)\/chat$/,
    fallback: (pathname, _state) => {
      const match = pathname.match(/^\/games\/([^/]+)\/chat$/);
      return match ? `/games/${match[1]}` : '/';
    },
    contextType: 'GAME',
    priority: 10,
  },
  
  // Game details routes (with state handling)
  {
    pattern: /^\/games\/[^/]+$/,
    fallback: (_pathname, state) => {
      if (state?.fromLeagueSeasonGameId) {
        return `/games/${state.fromLeagueSeasonGameId}`;
      }
      if (state?.fromPage) {
        const fromPageMap: Record<string, string> = {
          'find': '/find',
          'chats': '/chats',
          'bugs': '/bugs',
          'profile': '/profile',
          'leaderboard': '/leaderboard',
        };
        return fromPageMap[state.fromPage] || '/';
      }
      return '/';
    },
    priority: 5,
  },
  
  // Bugs list
  {
    pattern: /^\/bugs$/,
    fallback: '/',
    priority: 3,
  },

  {
    pattern: /^\/login\/telegram$/,
    fallback: '/login',
    priority: 5,
  },
  {
    pattern: /^\/login\/phone$/,
    fallback: '/login',
    priority: 5,
  },
  {
    pattern: /^\/login$/,
    fallback: '/',
    priority: 5,
  },

  // Default fallback for all other routes
  {
    pattern: /.*/,
    fallback: '/',
    priority: 0,
  },
];

export const findMatchingRoute = (pathname: string): RouteConfig | null => {
  const sorted = [...navigationRoutes].sort((a, b) => b.priority - a.priority);
  return sorted.find(route => route.pattern.test(pathname)) || null;
};
