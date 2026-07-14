import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLoadingScreen } from '@/components';
import { navigateWithTracking } from '@/utils/navigation';
import { resolveNextGamePath } from '@/utils/resolveNextGamePath';

export function NextGameRedirect() {
  const navigate = useNavigate();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let cancelled = false;
    void resolveNextGamePath().then((path) => {
      if (cancelled) return;
      navigateWithTracking(navigate, path, { replace: true });
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return <AppLoadingScreen isInitializing />;
}
