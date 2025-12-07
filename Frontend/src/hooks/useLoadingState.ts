import { useState, useCallback } from 'react';

export interface LoadingState {
  saving: boolean;
  restarting: boolean;
  editing: boolean;
  syncing: boolean;
  resolvingConflict: boolean;
}

export const useLoadingState = () => {
  const [loading, setLoading] = useState<LoadingState>({
    saving: false,
    restarting: false,
    editing: false,
    syncing: false,
    resolvingConflict: false,
  });

  const setLoadingState = useCallback((updates: Partial<LoadingState>) => {
    setLoading(prev => ({ ...prev, ...updates }));
  }, []);

  const isLoading = useCallback((key: keyof LoadingState) => {
    return loading[key];
  }, [loading]);

  return {
    loading,
    setLoadingState,
    isLoading,
  };
};

