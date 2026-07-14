import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AppLoadingScreen } from '@/components';
import { navigateWithTracking } from '@/utils/navigation';
import { nextGameOpenModeFromSearch, resolveNextGamePath } from '@/utils/resolveNextGamePath';

/** Sole owner of `/next-game` → game path resolution (web + Cap). */
export function NextGameRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    const mode = nextGameOpenModeFromSearch(location.search);
    void resolveNextGamePath(mode).then((path) => {
      if (cancelled) return;
      navigateWithTracking(navigate, path, { replace: true });
    });
    return () => {
      cancelled = true;
    };
  }, [navigate, location.search]);

  return <AppLoadingScreen isInitializing />;
}
