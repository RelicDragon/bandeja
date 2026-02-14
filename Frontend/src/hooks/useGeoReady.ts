import { useContext } from 'react';
import { GeoContext } from '@/contexts/GeoContext';

export function useGeoReady(): boolean {
  return useContext(GeoContext).geoReady;
}
