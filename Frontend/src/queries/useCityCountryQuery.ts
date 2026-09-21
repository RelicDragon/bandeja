import { useQuery } from '@tanstack/react-query';
import { citiesApi } from '@/api';
import { normalizeCountryIso2 } from '@shared/payments/paymentMethods';
import { useAuthStore } from '@/store/authStore';
import { queryKeys } from './queryKeys';

/**
 * PRD 348 — which country a game is played in, for the payment-method picker.
 *
 * Create Game holds a `cityId`, not the city row, and the club payload does not
 * carry its city either. Rather than thread a country through half the create
 * form, the city list is fetched once and cached for the session: it is small,
 * already fetched by several other screens, and changes about never.
 *
 * Falls back to the viewer's own current city, which is the right guess while
 * the form is still empty, and to `undefined` — the universal methods only —
 * when nothing is known. A wrong-looking short list is recoverable (the custom
 * option is always first); a list of rails that do not exist locally is not.
 */
export function useCityCountryQuery(cityId: string | null | undefined): string | undefined {
  const fallback = useAuthStore((state) => state.user?.currentCity?.country);

  const { data } = useQuery({
    queryKey: queryKeys.cities.all,
    queryFn: async () => (await citiesApi.getAll()).data ?? [],
    enabled: Boolean(cityId),
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });

  const city = cityId ? data?.find((row) => row.id === cityId) : undefined;
  return normalizeCountryIso2(city?.country) ?? normalizeCountryIso2(fallback);
}
