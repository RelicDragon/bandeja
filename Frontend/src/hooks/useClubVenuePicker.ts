import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { clubsApi } from '@/api/clubs';
import { useAuthStore } from '@/store/authStore';
import { useTranslatedGeo } from '@/hooks/useTranslatedGeo';
import { clubFromMapItem, clubMatchesQuery } from '@/utils/clubFromMapItem';
import { groupClubsByVenue } from '@/utils/groupClubsByVenue';
import type { Club, EntityType, Sport } from '@/types';

export function useClubVenuePicker(input: {
  isOpen: boolean;
  cityId?: string;
  selectedClubCityId?: string;
  selectedId?: string;
  entityType?: EntityType;
  preferredSport?: Sport | null;
  search: string;
  seedName?: string;
  seedCountry?: string;
}) {
  const { isOpen, cityId, selectedClubCityId, selectedId, entityType, preferredSport, search, seedName, seedCountry } = input;
  const homeCityId = useAuthStore((s) => s.user?.currentCity?.id);
  const homeCityName = useAuthStore((s) => s.user?.currentCity?.name);
  const homeCityCountry = useAuthStore((s) => s.user?.currentCity?.country);
  const { translateCity } = useTranslatedGeo();

  const resolvedId = cityId || selectedClubCityId || homeCityId || '';
  const [venueCityId, setVenueCityId] = useState(resolvedId);
  const [cityLabel, setCityLabel] = useState(seedName || homeCityName || '');
  const [cityCountry, setCityCountry] = useState(seedCountry || homeCityCountry || '');
  const [cityClubs, setCityClubs] = useState<Club[]>([]);
  const [mapClubs, setMapClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(false);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      const next = cityId || selectedClubCityId || homeCityId || '';
      if (next) setVenueCityId(next);
      if (seedName) {
        setCityLabel(seedName);
        setCityCountry(seedCountry ?? '');
      }
    }
    wasOpen.current = isOpen;
  }, [cityId, homeCityId, isOpen, seedCountry, seedName, selectedClubCityId]);

  useEffect(() => {
    if (!isOpen || !venueCityId) return;
    let cancelled = false;
    setLoading(true);
    setCityClubs([]);
    void clubsApi
      .getByCityId(venueCityId, entityType)
      .then((res) => {
        if (cancelled || !res.success) {
          if (!cancelled) setCityClubs([]);
          return;
        }
        setCityClubs(res.data ?? []);
        const named = res.data?.find((c) => c.city)?.city;
        if (named) {
          setCityLabel(named.name);
          setCityCountry(named.country);
        } else if (homeCityId === venueCityId && homeCityName) {
          setCityLabel(homeCityName);
          setCityCountry(homeCityCountry ?? '');
        }
      })
      .catch(() => {
        if (!cancelled) setCityClubs([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entityType, homeCityCountry, homeCityId, homeCityName, isOpen, venueCityId]);

  const query = search.trim();
  const searching = query.length > 0;
  const sport = preferredSport ?? undefined;

  useEffect(() => {
    if (!isOpen) {
      setMapClubs([]);
      return;
    }
    if (!searching) return;
    let cancelled = false;
    void clubsApi.getForMap().then((items) => {
      if (cancelled) return;
      setMapClubs(items.map(clubFromMapItem));
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, searching]);

  const displayed = useMemo(() => {
    const source = query ? mapClubs.filter((club) => clubMatchesQuery(club, query)) : cityClubs;
    const filtered = sport
      ? source.filter(
          (club) =>
            (!club.sports || club.sports.length === 0
              ? Boolean(query)
              : club.sports.includes(sport)) || club.id === selectedId,
        )
      : source;
    if (!query) return { here: filtered, elsewhere: [] };
    return groupClubsByVenue(filtered, venueCityId);
  }, [cityClubs, mapClubs, query, selectedId, sport, venueCityId]);

  const cityName =
    venueCityId && cityLabel ? translateCity(venueCityId, cityLabel, cityCountry) : cityLabel;

  const applyCity = useCallback((id: string, snapshot?: { name: string; country: string }) => {
    setVenueCityId(id);
    if (snapshot) {
      setCityLabel(snapshot.name);
      setCityCountry(snapshot.country);
    }
  }, []);

  return {
    venueCityId,
    cityName,
    isAway: Boolean(venueCityId && homeCityId && venueCityId !== homeCityId),
    homeCityId,
    displayed,
    loading,
    applyCity,
  };
}
