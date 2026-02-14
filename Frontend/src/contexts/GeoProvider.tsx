import { useEffect, useState } from 'react';
import { GeoContext } from '@/contexts/GeoContext';
import { ensureGeoDataLoaded, getGeoDataLoaded } from '@/utils/geoTranslations';

export function GeoProvider({ children }: { children: React.ReactNode }) {
  const [geoReady, setGeoReady] = useState(false);

  useEffect(() => {
    ensureGeoDataLoaded().then(() => {
      if (getGeoDataLoaded()) setGeoReady(true);
    });
  }, []);

  return (
    <GeoContext.Provider value={{ geoReady }}>
      {children}
    </GeoContext.Provider>
  );
}
