import { useTranslation } from 'react-i18next';
import { useTranslatedGeo } from '@/hooks/useTranslatedGeo';
import type { BasicUser } from '@/types';
import { PlayerListItem } from '@/components/PlayerListItem';
import { CityUserCard } from '@/components/chat/CityUserCard';

export type NearbyPeopleCity = {
  cityId: string;
  name: string;
  country: string;
  km: number;
  players: BasicUser[];
};

type NearbyPeopleSectionProps = {
  query: string;
  primaryCityName: string;
  groups: NearbyPeopleCity[];
  onViewCity: (cityId: string, snapshot: { name: string; country: string }) => void;
  variant: 'invite' | 'chat';
  selectedUserIds?: string[];
  onSelectUser?: (userId: string) => void;
};

export function NearbyPeopleSection({
  query,
  primaryCityName,
  groups,
  onViewCity,
  variant,
  selectedUserIds = [],
  onSelectUser,
}: NearbyPeopleSectionProps) {
  const { t } = useTranslation();
  const { translateCity } = useTranslatedGeo();
  const visible = groups.filter((group) => group.players.length > 0);

  if (visible.length === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
          {t('browseCity.nobodyInCity', { city: primaryCityName, query })}
        </p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t('browseCity.nobodyNearby', { query })}
        </p>
      </div>
    );
  }

  return (
    <div className="px-2.5 pb-3">
      <p className="px-1 pb-2 text-center text-[12px] font-medium text-gray-500 dark:text-gray-400">
        {t('browseCity.nobodyInCity', { city: primaryCityName, query })}
      </p>
      {visible.map((group) => {
        const cityLabel = translateCity(group.cityId, group.name, group.country);
        return (
          <section key={group.cityId} className="mb-3">
            <div className="mb-1 flex items-center justify-between gap-2 px-1">
              <p className="min-w-0 truncate text-[12px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                {t('browseCity.nearby')} · {cityLabel} · {t('browseCity.km', { km: Math.round(group.km) })}
              </p>
              <button
                type="button"
                onClick={() => onViewCity(group.cityId, { name: group.name, country: group.country })}
                className="shrink-0 text-[12px] font-semibold text-primary-600 dark:text-primary-400"
              >
                {t('browseCity.viewCity', { city: cityLabel })}
              </button>
            </div>
            {variant === 'chat'
              ? group.players.map((user) => (
                  <CityUserCard
                    key={user.id}
                    user={user}
                    onClick={() => onSelectUser?.(user.id)}
                  />
                ))
              : group.players.map((user) => (
                  <PlayerListItem
                    key={user.id}
                    player={user}
                    isSelected={selectedUserIds.includes(user.id)}
                    gamesTogetherCount={0}
                    onSelect={() => onSelectUser?.(user.id)}
                  />
                ))}
          </section>
        );
      })}
    </div>
  );
}
