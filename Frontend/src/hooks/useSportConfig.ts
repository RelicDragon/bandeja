import { useMemo } from 'react';
import { getSportConfig, type Sport, type SportConfig } from '@/sport/sportRegistry';

export function useSportConfig(sport: Sport | string | null | undefined): SportConfig {
  return useMemo(() => getSportConfig(sport), [sport]);
}
