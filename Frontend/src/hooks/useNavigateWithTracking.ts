import { useNavigate, NavigateOptions } from 'react-router-dom';
import { useCallback } from 'react';
import { navigateWithTracking, LocationState } from '@/utils/navigation';

/**
 * Custom hook that wraps useNavigate with automatic navigation tracking.
 * Use this instead of useNavigate() to ensure all navigations are tracked
 * in the History State API for proper back button functionality.
 */
export const useNavigateWithTracking = () => {
  const navigate = useNavigate();
  
  return useCallback(
    (path: string | number, options?: NavigateOptions & { state?: LocationState }) => {
      navigateWithTracking(navigate, path, options);
    },
    [navigate]
  );
};
