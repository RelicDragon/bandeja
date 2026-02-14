import { createContext } from 'react';

export interface GeoContextValue {
  geoReady: boolean;
}

export const GeoContext = createContext<GeoContextValue>({ geoReady: false });
