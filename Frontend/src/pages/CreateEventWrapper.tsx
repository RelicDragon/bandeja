import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CreateEvent } from './CreateEvent';
import type { Game } from '@/types';
import { useShellNavStore } from '@/store/shellNavStore';
import { useBackButtonHandler } from '@/hooks/useBackButtonHandler';

export const CreateEventWrapper = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as { initialGameData?: Partial<Game> } | null;
  const { setBottomTabsVisible } = useShellNavStore();

  useEffect(() => {
    setBottomTabsVisible(false);
    return () => {
      setBottomTabsVisible(true);
    };
  }, [setBottomTabsVisible]);

  useBackButtonHandler(() => {
    navigate('/', { replace: true });
    return true;
  });

  return <CreateEvent initialGameData={state?.initialGameData} />;
};
