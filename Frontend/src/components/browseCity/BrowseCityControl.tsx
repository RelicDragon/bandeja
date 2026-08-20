import { useState } from 'react';
import { CityModal } from '@/components/CityModal';
import { BrowseCityChip } from '@/components/browseCity/BrowseCityChip';
import { useResolvedBrowseCity } from '@/hooks/useResolvedBrowseCity';
import { useBrowseCityStore } from '@/store/browseCityStore';
import { useAuthStore } from '@/store/authStore';
import type { City } from '@/types';

type BrowseCityControlProps = {
  size?: 'bar' | 'field';
  className?: string;
  onOpen?: () => void;
};

export function BrowseCityControl({ size = 'bar', className, onOpen }: BrowseCityControlProps) {
  const [open, setOpen] = useState(false);
  const browse = useResolvedBrowseCity();
  const recents = useBrowseCityStore((s) => s.recents);
  const homeCityId = useAuthStore((s) => s.user?.currentCity?.id ?? s.user?.currentCityId);

  const applyCity = (id: string, city?: City) => {
    if (homeCityId && id === homeCityId) {
      useBrowseCityStore.getState().setCityId(id, undefined, homeCityId);
      return;
    }
    useBrowseCityStore.getState().setCityId(
      id,
      city ? { name: city.name, country: city.country } : undefined,
      homeCityId,
    );
  };

  return (
    <div className={className}>
      <BrowseCityChip
        cityName={browse.name}
        isAway={browse.isAway}
        size={size}
        disabled={!browse.hasCity}
        onClick={() => (onOpen ? onOpen() : setOpen(true))}
      />
      {!onOpen && open ? (
        <CityModal
          isOpen={open}
          onClose={() => setOpen(false)}
          selectedId={browse.cityId}
          recentCityIds={recents.filter((id) => id !== homeCityId)}
          onSelect={applyCity}
        />
      ) : null}
    </div>
  );
}

export type { City };
