import { useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { backButtonService } from '@/services/backButtonService';
import { useNavigationStore } from '@/store/navigationStore';
import { canNavigateBack } from '@/utils/navigation';

type BackHandler = () => boolean | void;

export const useBackButtonHandler = (handler?: BackHandler) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentPage, setCurrentPage, setIsAnimating } = useNavigationStore();

  const defaultHandler = useCallback(() => {
    setIsAnimating(true);
    
    const locationState = location.state as { fromLeagueSeasonGameId?: string } | null;
    
    if (currentPage === 'gameDetails') {
      if (canNavigateBack()) {
        navigate(-1);
      } else {
        setCurrentPage('my');
        navigate('/', { replace: true });
      }
    } else if (locationState?.fromLeagueSeasonGameId) {
      setCurrentPage('gameDetails');
      navigate(`/games/${locationState.fromLeagueSeasonGameId}`, { replace: true });
    } else {
      setCurrentPage('my');
      navigate('/', { replace: true });
    }
    
    setTimeout(() => setIsAnimating(false), 300);
  }, [location.state, currentPage, navigate, setCurrentPage, setIsAnimating]);

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
