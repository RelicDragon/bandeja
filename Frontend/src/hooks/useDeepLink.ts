import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { App } from '@capacitor/app';
import { isCapacitor } from '@/utils/capacitor';

export const useDeepLink = () => {
  const navigate = useNavigate();
  const hasHandledLaunchUrl = useRef(false);

  useEffect(() => {
    if (!isCapacitor()) return;

    const handleDeepLink = (urlString: string) => {
      try {
        const url = new URL(urlString);
        if (url.hostname === 'bandeja.me' && url.pathname.startsWith('/games/')) {
          const gameId = url.pathname.split('/games/')[1]?.split('/')[0];
          if (gameId) {
            navigate(`/games/${gameId}`, { replace: true });
          }
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

