import { LocationState } from '@/utils/navigation';

export interface RouteConfig {
  pattern: RegExp;
  fallback: string | ((pathname: string, state: LocationState | null) => string);
  contextType?: 'USER' | 'BUG' | 'GAME' | 'GROUP';
  setFilter?: 'users' | 'bugs' | 'channels';
  priority: number;
}

export const navigationRoutes: RouteConfig[] = [
  // User chat routes
  {
    pattern: /^\/user-chat\/[^/]+$/,
    fallback: (_pathname, state) =>
      state?.fromPage === 'chats' && state?.searchQuery
        ? `/chats?q=${encodeURIComponent(state.searchQuery)}`
        : '/chats',
    contextType: 'USER',
    setFilter: 'users',
    priority: 10,
  },

  // Group chat routes
  {
    pattern: /^\/group-chat\/[^/]+$/,
    fallback: (_pathname, state) =>
      state?.fromPage === 'chats' && state?.searchQuery
        ? `/chats?q=${encodeURIComponent(state.searchQuery)}`
        : '/chats',
    contextType: 'GROUP',
    setFilter: 'channels',
    priority: 10,
  },

  // Channel chat routes
  {
    pattern: /^\/channel-chat\/[^/]+$/,
    fallback: (_pathname, state) => {
      if (state?.fromPage === 'bugs') return '/bugs';
      if (state?.fromPage === 'marketplace') return '/marketplace';
      if (state?.fromPage === 'chats' && state?.searchQuery) {
        return `/chats?q=${encodeURIComponent(state.searchQuery)}`;
      }
      if (state?.fromPage === 'chats') return '/chats';
      return '/chats';
    },
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
      if (state?.fromPage === 'chats' && state?.searchQuery) {
        return `/chats?q=${encodeURIComponent(state.searchQuery)}`;
      }
      if (state?.fromPage) {
        const fromPageMap: Record<string, string> = {
          'find': '/find',
          'chats': '/chats',
          'bugs': '/bugs',
          'profile': '/profile',
          'leaderboard': '/leaderboard',
          'marketplace': '/marketplace',
        };
        return fromPageMap[state.fromPage] || '/';
      }
      return '/';
    },
    priority: 5,
  },
  
  {
    pattern: /^\/marketplace\/[^/]+\/edit$/,
    fallback: '/marketplace',
    priority: 10,
  },
  {
    pattern: /^\/marketplace\/[^/]+$/,
    fallback: '/marketplace',
    priority: 10,
  },
  {
    pattern: /^\/marketplace\/create$/,
    fallback: '/marketplace',
    priority: 10,
  },
  {
    pattern: /^\/marketplace\/?$/,
    fallback: '/',
    priority: 5,
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
  {
    pattern: /^\/profile\/?$/,
    fallback: (_pathname, state) => {
      if (state?.fromPage) {
        const fromPageMap: Record<string, string> = {
          'my': '/',
          'find': '/find',
          'chats': '/chats',
          'bugs': '/bugs',
          'leaderboard': '/leaderboard',
          'marketplace': '/marketplace',
        };
        return fromPageMap[state.fromPage] || '/';
      }
      return '/';
    },
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
