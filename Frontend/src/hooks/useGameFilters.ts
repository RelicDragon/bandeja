import { useState, useEffect, useRef } from 'react';
import { getGameFilters, setGameFilters, GameFilters } from '@/utils/gameFiltersStorage';

const DEFAULT_FILTERS: GameFilters = {
  userFilter: false,
  trainingFilter: false,
  tournamentFilter: false,
  leaguesFilter: false,
  activeTab: 'calendar',
};

export const useGameFilters = () => {
  const [filters, setFilters] = useState<GameFilters>(DEFAULT_FILTERS);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    getGameFilters().then((f) => {
      const merged = { ...DEFAULT_FILTERS, ...f };
      const activeCount = [merged.trainingFilter, merged.tournamentFilter, merged.leaguesFilter].filter(Boolean).length;
      if (activeCount > 1) {
        if (merged.trainingFilter) merged.tournamentFilter = merged.leaguesFilter = false;
        else if (merged.tournamentFilter) merged.leaguesFilter = false;
      }
      setFilters(merged);
      hasLoadedRef.current = true;
    });
  }, []);

  useEffect(() => {
    if (hasLoadedRef.current) {
      setGameFilters(filters);
    }
  }, [filters]);

  const updateFilter = <K extends keyof GameFilters>(key: K, value: GameFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const updateFilters = (updates: Partial<GameFilters>) => {
    setFilters((prev) => ({ ...prev, ...updates }));
  };

  return { filters, setFilters, updateFilter, updateFilters };
};
