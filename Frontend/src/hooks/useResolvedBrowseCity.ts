import { useMemo } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useBrowseCityStore } from '@/store/browseCityStore';
import { useTranslatedGeo } from '@/hooks/useTranslatedGeo';

export function getHomeCityId(): string | undefined {
  const user = useAuthStore.getState().user;
  return user?.currentCity?.id ?? user?.currentCityId ?? undefined;
}

export function getResolvedBrowseCityId(): string | undefined {
  return useBrowseCityStore.getState().cityId ?? getHomeCityId();
}

export function useResolvedBrowseCity() {
  const homeCity = useAuthStore((s) => s.user?.currentCity);
  const homeCityIdFromUser = useAuthStore((s) => s.user?.currentCityId);
  const homeCityId = homeCity?.id ?? homeCityIdFromUser;
  const browseCityId = useBrowseCityStore((s) => s.cityId);
  const snapshot = useBrowseCityStore((s) =>
    browseCityId ? s.snapshots[browseCityId] : undefined,
  );
  const { translateCity } = useTranslatedGeo();

  const cityId = browseCityId ?? homeCityId ?? undefined;
  const isAway = Boolean(browseCityId && homeCityId && browseCityId !== homeCityId);

  const rawName = isAway
    ? snapshot?.name ?? homeCity?.name ?? ''
    : homeCity?.name ?? snapshot?.name ?? '';
  const country = isAway
    ? snapshot?.country ?? homeCity?.country ?? ''
    : homeCity?.country ?? snapshot?.country ?? '';
  const name = useMemo(
    () => (cityId && rawName ? translateCity(cityId, rawName, country) : rawName),
    [cityId, country, rawName, translateCity],
  );

  return {
    cityId,
    homeCityId: homeCityId ?? undefined,
    name,
    country,
    isAway,
    hasCity: Boolean(cityId),
  };
}
