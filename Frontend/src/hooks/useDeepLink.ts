import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { App } from '@capacitor/app';
import { isCapacitor } from '@/utils/capacitor';
import { navigateWithTracking } from '@/utils/navigation';
import { useDeepLinkStore } from '@/store/deepLinkStore';
import { isBandejaDeepLinkHost } from '@/utils/bandejaDeepLinkHost';
import { isTelegramAutoLoginPath } from '@/utils/telegramAutoLoginPath';
import { shouldHandleTelegramLoginDeepLink } from '@/utils/telegramDeepLinkDedupe';
import { appendLevelSportQuery, parseLevelSportQuery } from '@/utils/levelSportQuery';
import { bumpChatFreshOpenNonce } from '@/services/chat/chatOpenEntry';
import { resolveFindDeepLinkTarget, deepLinkActionPath } from '@/deepLinks';

function navigateFreshChat(
  navigate: ReturnType<typeof useNavigate>,
  path: string
): void {
  bumpChatFreshOpenNonce();
  navigateWithTracking(navigate, path, { replace: true, state: { forceReload: Date.now() } });
}

export const useDeepLink = () => {
  const navigate = useNavigate();
  const hasHandledLaunchUrl = useRef(false);

  useEffect(() => {
    if (!isCapacitor()) return;

    const handleDeepLink = (urlString: string) => {
      try {
        const url = new URL(urlString);
        if (!isBandejaDeepLinkHost(url.hostname)) return;

        const pathname = url.pathname.replace(/\/+$/, '') || '/';
        if (isTelegramAutoLoginPath(pathname)) {
          useDeepLinkStore.getState().setPendingAuthPath(pathname);
        }

        // Games routes
        if (pathname.startsWith('/games/')) {
          const parts = pathname.split('/').filter(Boolean);
          if (parts.length >= 2) {
            const gameId = parts[1];
            // Handle chat routes
            if (parts.length >= 3 && parts[2] === 'chat') {
              navigateFreshChat(navigate, `/games/${gameId}/chat`);
              return;
            }
            // Handle live/tv routes
            if (parts.length >= 5 && parts[2] === 'live' && parts[3] === 'tv') {
              navigateWithTracking(navigate, `/games/${gameId}/live/tv`, { replace: true });
              return;
            }
            // Handle live/broadcast routes
            if (parts.length >= 5 && parts[2] === 'live' && parts[3] === 'broadcast') {
              navigateWithTracking(navigate, `/games/${gameId}/live/broadcast`, { replace: true });
              return;
            }
            // Handle broadcast routes
            if (parts.length >= 4 && parts[2] === 'broadcast') {
              navigateWithTracking(navigate, `/games/${gameId}/broadcast`, { replace: true });
              return;
            }
            // Handle live routes
            if (parts.length >= 4 && parts[2] === 'live') {
              navigateWithTracking(navigate, `/games/${gameId}/live`, { replace: true });
              return;
            }
            // Handle league-table routes
            if (parts.length >= 4 && parts[2] === 'league-table') {
              navigateWithTracking(navigate, `/games/${gameId}/league-table`, { replace: true });
              return;
            }
            // Handle league-bracket routes
            if (parts.length >= 4 && parts[2] === 'league-bracket') {
              navigateWithTracking(navigate, `/games/${gameId}/league-bracket`, { replace: true });
              return;
            }
            // Default game detail route
            navigateWithTracking(navigate, `/games/${gameId}`, { replace: true });
            return;
          }
        }
        
        if (pathname.startsWith('/user-team/')) {
          const id = pathname.split('/user-team/')[1]?.split('/')[0];
          if (id) {
            navigateWithTracking(navigate, `/user-team/${id}`, { replace: true });
            return;
          }
        }

        if (pathname.startsWith('/user-profile/')) {
          const id = pathname.split('/user-profile/')[1]?.split('/')[0];
          if (id) {
            const sport = parseLevelSportQuery(url.searchParams.get('sport'));
            navigateWithTracking(
              navigate,
              appendLevelSportQuery(`/user-profile/${id}`, sport),
              { replace: true },
            );
            return;
          }
        }

        // Chat routes
        if (pathname.startsWith('/user-chat/')) {
          const id = pathname.split('/user-chat/')[1]?.split('/')[0];
          if (id) {
            navigateFreshChat(navigate, `/user-chat/${id}`);
            return;
          }
        }
        
        if (pathname.startsWith('/group-chat/')) {
          const id = pathname.split('/group-chat/')[1]?.split('/')[0];
          if (id) {
            navigateFreshChat(navigate, `/group-chat/${id}`);
            return;
          }
        }
        
        if (pathname.startsWith('/bugs/')) {
          const id = pathname.split('/bugs/')[1]?.split('/')[0];
          if (id) {
            navigateFreshChat(navigate, `/bugs/${id}`);
            return;
          }
        }
        if (pathname.startsWith('/channel-chat/')) {
          const id = pathname.split('/channel-chat/')[1]?.split('/')[0];
          if (id) {
            navigateFreshChat(navigate, `/channel-chat/${id}${url.search || ''}`);
            return;
          }
        }


        if (pathname === '/marketplace' || pathname === '/marketplace/my' || pathname === '/marketplace/create') {
          const search = url.search || '';
          navigateWithTracking(navigate, `${pathname}${search}`, { replace: true });
          return;
        }

        // Marketplace item edit routes
        if (pathname.startsWith('/marketplace/') && pathname.endsWith('/edit')) {
          const search = url.search || '';
          navigateWithTracking(navigate, `${pathname}${search}`, { replace: true });
          return;
        }

        // Marketplace item detail routes
        if (pathname.startsWith('/marketplace/')) {
          const search = url.search || '';
          navigateWithTracking(navigate, `${pathname}${search}`, { replace: true });
          return;
        }

        if (pathname.startsWith('/login/') && pathname !== '/login/phone' && pathname !== '/login/telegram') {
          if (!shouldHandleTelegramLoginDeepLink(pathname)) return;
          navigateWithTracking(navigate, pathname, { replace: true });
          return;
        }

        if (pathname === deepLinkActionPath('nextGame').split('?')[0]) {
          // Single owner: route only; NextGameRedirect resolves (same as web).
          navigateWithTracking(navigate, `${pathname}${url.search || ''}`, { replace: true });
          return;
        }

        // Find tab — canonicalize catalog findToday; forward other Find queries as-is
        if (pathname === '/find') {
          navigateWithTracking(
            navigate,
            resolveFindDeepLinkTarget(pathname, url.search),
            { replace: true },
          );
          return;
        }

        // Simple routes (no parameters) — catalog-backed where applicable
        const simpleRoutes: Record<string, string> = {
          [deepLinkActionPath('chats')]: deepLinkActionPath('chats'),
          '/profile': '/profile',
          '/leaderboard': '/leaderboard',
          '/bugs': '/bugs',
          '/game-subscriptions': '/game-subscriptions',
          [deepLinkActionPath('createGame')]: deepLinkActionPath('createGame'),
          [deepLinkActionPath('createLeague')]: deepLinkActionPath('createLeague'),
          [deepLinkActionPath('login')]: deepLinkActionPath('login'),
          '/register': '/register',
          '/select-city': '/select-city',
          [deepLinkActionPath('myGames')]: deepLinkActionPath('myGames'),
        };

        // Routes with search parameters (assistant / invites focus)
        const routesWithSearchParams: string[] = [
          deepLinkActionPath('login'),
          deepLinkActionPath('chats'),
          deepLinkActionPath('myGames'),
        ];

        if (simpleRoutes[pathname]) {
          const target = simpleRoutes[pathname];
          if (routesWithSearchParams.includes(pathname) && url.search) {
            navigateWithTracking(navigate, `${target}${url.search}`, { replace: true });
            return;
          }
          navigateWithTracking(navigate, target, { replace: true });
          return;
        }

        // My-clubs routes (wildcard route)
        if (pathname.startsWith('/my-clubs/')) {
          navigateWithTracking(navigate, pathname, { replace: true });
          return;
        }
      } catch (error) {
        console.error('Error handling deep link:', error);
      }
    };

    let listenerHandle: any = null;

    if (!hasHandledLaunchUrl.current) {
      hasHandledLaunchUrl.current = true;
      App.getLaunchUrl()
        .then((result) => {
          if (result?.url) handleDeepLink(result.url);
        })
        .catch(() => {});
    }

    App.addListener('appUrlOpen', (event) => {
      handleDeepLink(event.url);
    }).then((handle) => {
      listenerHandle = handle;
    });

    return () => {
      if (listenerHandle) {
        listenerHandle.remove();
      }
    };
  }, [navigate]);
};

