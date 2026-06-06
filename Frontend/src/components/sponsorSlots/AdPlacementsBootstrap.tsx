import { useAdPlacementsFetcher } from '@/hooks/useAdPlacements';

export function AdPlacementsBootstrap() {
  useAdPlacementsFetcher();
  return null;
}
