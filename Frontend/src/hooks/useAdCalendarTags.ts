import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { adsApi, type AdCalendarTag } from '@/api/sponsorPlacements';
import { useEffectiveAdSportsByPlacement } from '@/hooks/useAdPlacements';
import { useAuthStore } from '@/store/authStore';
import { resolveAdClickLocale } from '@/utils/adClickPersonalization';
import { useNetworkStore } from '@/utils/networkStatus';

const CALENDAR_TAG_REFRESH_MS = 60_000;
const DEFAULT_CALENDAR_TAG_COLOR = '#7C3AED';

export type CalendarDayAdTag = Pick<AdCalendarTag, 'campaignId' | 'label' | 'color' | 'message'>;

function toDayKey(value: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})(?:T|$)/.exec(value);
  return match?.[1] ?? null;
}

function tagAppliesOnDay(tag: AdCalendarTag, dayKey: string): boolean {
  const startKey = tag.startsAt ? toDayKey(tag.startsAt) : null;
  const endKey = tag.endsAt ? toDayKey(tag.endsAt) : null;
  if (startKey && dayKey < startKey) return false;
  if (endKey && dayKey > endKey) return false;
  return true;
}

/**
 * Fetches ad calendar tags the viewer is eligible for (targeting-based;
 * dismiss/snooze do not hide them) and maps them onto calendar day keys.
 */
export function useAdCalendarTags() {
  const { i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isInitializing = useAuthStore((s) => s.isInitializing);
  const isOnline = useNetworkStore((s) => s.isOnline);
  const sportsByPlacement = useEffectiveAdSportsByPlacement();

  const userCityId = user?.currentCity?.id ?? user?.currentCityId;
  const locale = resolveAdClickLocale(
    i18n.language,
    user?.language,
    typeof navigator !== 'undefined' ? navigator.language : null,
  );

  const enabled =
    !isInitializing &&
    isAuthenticated &&
    Boolean(user?.id) &&
    Boolean(userCityId) &&
    isOnline;
  const query = useQuery({
    queryKey: [
      'ads',
      'calendar-tags',
      user?.id ?? null,
      userCityId ?? null,
      sportsByPlacement,
      locale,
    ],
    queryFn: () => adsApi.getCalendarTags({
      cityId: userCityId,
      sportsByPlacement,
      locale,
    }),
    enabled,
    staleTime: CALENDAR_TAG_REFRESH_MS,
    refetchInterval: enabled ? CALENDAR_TAG_REFRESH_MS : false,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
    retry: 2,
  });
  const tags = useMemo(
    () => enabled && !query.isError && !query.isRefetchError ? (query.data?.tags ?? []) : [],
    [enabled, query.data?.tags, query.isError, query.isRefetchError],
  );

  const getTagsForDay = useMemo(() => {
    const active = tags.filter((t) => (t.label ?? '').trim());
    return (dayKey: string): CalendarDayAdTag[] => {
      const dayTags: CalendarDayAdTag[] = [];
      const labels = new Set<string>();
      for (const tag of active) {
        if (!tagAppliesOnDay(tag, dayKey)) continue;
        const label = (tag.label ?? '').trim().toUpperCase().slice(0, 20);
        if (!label || labels.has(label)) continue;
        labels.add(label);
        dayTags.push({
          campaignId: tag.campaignId,
          label,
          color: /^#[0-9A-Fa-f]{6}$/.test(tag.color ?? '')
            ? tag.color.toUpperCase()
            : DEFAULT_CALENDAR_TAG_COLOR,
          message: typeof tag.message === 'string' && tag.message.trim()
            ? tag.message.trim()
            : null,
        });
      }
      return dayTags;
    };
  }, [tags]);

  return useMemo(() => ({ tags, getTagsForDay }), [tags, getTagsForDay]);
}
