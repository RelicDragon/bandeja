import { useEffect, useMemo, useState } from 'react';
import { GeoJSON } from 'react-leaflet';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { PathOptions } from 'leaflet';
import {
  assignCountryWarmColorIndexes,
  getCountryWarmFillByIndex,
  getCountryWarmStrokeByIndex,
} from '@/utils/countryWarmColor';
import { splitAntimeridianFeatures } from './splitAntimeridian';

type CountryFeature = Feature<Geometry, { name: string }>;
type CountryCollection = FeatureCollection<Geometry, { name: string }>;

let cachedGeo: CountryCollection | null = null;
let loadPromise: Promise<CountryCollection | null> | null = null;

function loadCountriesGeo(): Promise<CountryCollection | null> {
  if (cachedGeo) return Promise.resolve(cachedGeo);
  if (!loadPromise) {
    loadPromise = fetch('/geo/countries-110m.geojson?v=8')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: CountryCollection | null) => {
        if (data?.type === 'FeatureCollection') {
          cachedGeo = splitAntimeridianFeatures(data);
          return cachedGeo;
        }
        return null;
      })
      .catch(() => null);
  }
  return loadPromise;
}

export function CountryTintLayer({ countries }: { countries: readonly string[] }) {
  const [geo, setGeo] = useState<CountryCollection | null>(cachedGeo);
  const countrySet = useMemo(() => new Set(countries.filter(Boolean)), [countries]);
  const colorByCountry = useMemo(
    () => assignCountryWarmColorIndexes([...countrySet]),
    [countrySet]
  );

  useEffect(() => {
    let cancelled = false;
    void loadCountriesGeo().then((data) => {
      if (!cancelled && data) setGeo(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!geo || countrySet.size === 0) return null;
    const features = (geo.features as CountryFeature[]).filter((f) => countrySet.has(f.properties.name));
    if (features.length === 0) return null;
    return { type: 'FeatureCollection' as const, features };
  }, [geo, countrySet]);

  const styleFn = useMemo(() => {
    return (feature?: Feature<Geometry, { name?: string }>): PathOptions => {
      const name = feature?.properties?.name ?? '';
      const index = colorByCountry.get(name) ?? 0;
      return {
        fillColor: getCountryWarmFillByIndex(index),
        fillOpacity: 1,
        color: getCountryWarmStrokeByIndex(index),
        weight: 1.25,
        opacity: 1,
        interactive: false,
      };
    };
  }, [colorByCountry]);

  if (!filtered) return null;

  return (
    <GeoJSON
      key={[...countrySet].sort().join('|')}
      data={filtered}
      style={styleFn}
    />
  );
}
