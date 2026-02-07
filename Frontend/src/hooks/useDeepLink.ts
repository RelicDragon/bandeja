import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { App } from '@capacitor/app';
import { isCapacitor } from '@/utils/capacitor';
import { navigateWithTracking } from '@/utils/navigation';
import { useNavigationStore } from '@/store/navigationStore';

export const useDeepLink = () => {
  const navigate = useNavigate();
  const hasHandledLaunchUrl = useRef(false);

  useEffect(() => {
    if (!isCapacitor()) return;

    const handleDeepLink = async (urlString: string) => {
      try {
        const url = new URL(urlString);
        if (url.hostname !== 'bandeja.me') return;

        const pathname = url.pathname;
        
        // Games routes
        if (pathname.startsWith('/games/')) {
          const parts = pathname.split('/').filter(Boolean);
          if (parts.length >= 2) {
            const gameId = parts[1];
            if (parts.length === 3 && parts[2] === 'chat') {
              navigateWithTracking(navigate, `/games/${gameId}/chat`, { replace: true });
            } else {
              navigateWithTracking(navigate, `/games/${gameId}`, { replace: true });
            }
            return;
          }
        }
        
        // Chat routes
        if (pathname.startsWith('/user-chat/')) {
          const id = pathname.split('/user-chat/')[1]?.split('/')[0];
          if (id) {
            navigateWithTracking(navigate, `/user-chat/${id}`, { replace: true });
            return;
          }
        }
        
        if (pathname.startsWith('/group-chat/')) {
          const id = pathname.split('/group-chat/')[1]?.split('/')[0];
          if (id) {
            navigateWithTracking(navigate, `/group-chat/${id}`, { replace: true });
            return;
          }
        }
        
        if (pathname.startsWith('/channel-chat/')) {
          const id = pathname.split('/channel-chat/')[1]?.split('/')[0];
          if (id) {
            navigateWithTracking(navigate, `/channel-chat/${id}`, { replace: true });
            return;
          }
        }
        
        // Bugs routes (legacy /bugs/:id/chat -> /channel-chat/:groupChannelId)
        if (pathname.startsWith('/bugs/')) {
          const parts = pathname.split('/').filter(Boolean);
          if (parts.length >= 2) {
            const bugId = parts[1];
            if (parts.length === 3 && parts[2] === 'chat') {
              try {
                const { bugsApi } = await import('@/api');
                const res = await bugsApi.getBugById(bugId);
                const groupChannelId = res.data?.groupChannel?.id;
                if (groupChannelId) {
                  useNavigationStore.getState().setChatsFilter('bugs');
                  navigateWithTracking(navigate, `/channel-chat/${groupChannelId}`, { replace: true });
                } else {
                  useNavigationStore.getState().setChatsFilter('bugs');
                  navigateWithTracking(navigate, '/chats', { replace: true });
                }
              } catch {
                useNavigationStore.getState().setChatsFilter('bugs');
                navigateWithTracking(navigate, '/chats', { replace: true });
              }
              return;
            }
          }
        }
        
        // Simple routes (no parameters)
        const simpleRoutes: Record<string, string> = {
          '/find': '/find',
          '/chats': '/chats',
          '/profile': '/profile',
          '/leaderboard': '/leaderboard',
          '/bugs': '/bugs',
          '/game-subscriptions': '/game-subscriptions',
          '/create-game': '/create-game',
          '/create-league': '/create-league',
          '/login': '/login',
          '/register': '/register',
          '/select-city': '/select-city',
          '/complete-profile': '/complete-profile',
          '/': '/'
        };
        
        if (simpleRoutes[pathname]) {
          navigateWithTracking(navigate, simpleRoutes[pathname], { replace: true });
          return;
        }
      } catch (error) {
        console.error('Error handling deep link:', error);
      }
    };

    let listenerHandle: any = null;

    App.addListener('appUrlOpen', (event) => {
      handleDeepLink(event.url);
    }).then((handle) => {
      listenerHandle = handle;
    });

    if (!hasHandledLaunchUrl.current) {
      hasHandledLaunchUrl.current = true;
      App.getLaunchUrl()
        .then((result) => {
          if (result?.url) {
            setTimeout(() => {
              handleDeepLink(result.url);
            }, 100);
          }
        })
        .catch(() => {
          // No launch URL, app was opened normally
        });
    }

    return () => {
      if (listenerHandle) {
        listenerHandle.remove();
      }
    };
  }, [navigate]);
};

