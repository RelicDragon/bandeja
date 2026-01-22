import { useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { backButtonService } from '@/services/backButtonService';
import { useNavigationStore } from '@/store/navigationStore';
import { handleBackNavigation } from '@/utils/navigation';

type BackHandler = () => boolean | void;

export const useBackButtonHandler = (handler?: BackHandler) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { setCurrentPage, setIsAnimating } = useNavigationStore();

  useEffect(() => {
    backButtonService.setNavigate((path: string | number, options?: { replace?: boolean }) => {
      if (typeof path === 'number') {
        navigate(path);
      } else {
        navigate(path, options);
      }
    });
  }, [navigate]);

  const defaultHandler = useCallback(() => {
    setIsAnimating(true);
    
    handleBackNavigation({
      pathname: location.pathname,
      locationState: location.state as { fromLeagueSeasonGameId?: string } | null,
      navigate,
      setCurrentPage,
    });
    
    setTimeout(() => setIsAnimating(false), 300);
    return true;
  }, [location.pathname, location.state, navigate, setCurrentPage, setIsAnimating]);

  useEffect(() => {
    if (handler) {
      backButtonService.registerPageHandler(handler);
    } else {
      backButtonService.registerPageHandler(defaultHandler);
    }

    return () => {
      backButtonService.unregisterPageHandler();
    };
  }, [handler, defaultHandler]);
};
