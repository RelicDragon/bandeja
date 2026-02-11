import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { backButtonService } from '@/services/backButtonService';
import { handleBack } from '@/utils/backNavigation';

type BackHandler = () => boolean | void;

export const useBackButtonHandler = (handler?: BackHandler) => {
  const navigate = useNavigate();

  useEffect(() => {
    backButtonService.setNavigate(navigate);
  }, [navigate]);

  const defaultHandler = useCallback(() => {
    handleBack(navigate);
    return true;
  }, [navigate]);

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
