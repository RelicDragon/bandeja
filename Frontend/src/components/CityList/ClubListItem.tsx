import { memo } from 'react';
import { useGeoReady } from '@/hooks/useGeoReady';
import { useTranslatedGeo } from '@/hooks/useTranslatedGeo';
import type { ClubMapItem } from '@/api/clubs';
import { ClubSelectorCard } from '@/components/ClubSelectorCard';

export interface ClubListItemProps {
  club: ClubMapItem;
  isSelected: boolean;
  isNearest: boolean;
  onSelect: (cityId: string) => void;
  onInfoClick?: (club: ClubMapItem) => void;
  scrollTargetRef?: React.RefObject<HTMLDivElement | null>;
  className?: string;
}

function ClubListItemInner({
  club,
  isSelected,
  isNearest,
  onSelect,
  onInfoClick,
  scrollTargetRef,
  className = '',
}: ClubListItemProps) {
  useGeoReady();
  const { translateCity, translateCountry } = useTranslatedGeo();
  const cityDisplay = translateCity(club.cityId, club.cityName, club.country);
  const countryDisplay = translateCountry(club.country);
  const subtitle = `${cityDisplay}, ${countryDisplay}`;

  return (
    <div ref={scrollTargetRef} className={className}>
      <ClubSelectorCard
        club={club}
        subtitle={subtitle}
        isSelected={isSelected}
        isNearest={isNearest}
        onSelect={() => onSelect(club.cityId)}
        onInfoClick={
          onInfoClick
            ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                onInfoClick(club);
              }
            : undefined
        }
        showInfoButton={!!onInfoClick}
      />
    </div>
  );
}

export const ClubListItem = memo(ClubListItemInner, (prev, next) =>
  prev.club.id === next.club.id &&
  prev.club.avatar === next.club.avatar &&
  prev.club.name === next.club.name &&
  prev.club.address === next.club.address &&
  prev.isSelected === next.isSelected &&
  prev.isNearest === next.isNearest &&
  prev.onSelect === next.onSelect &&
  prev.onInfoClick === next.onInfoClick &&
  prev.scrollTargetRef === next.scrollTargetRef
);
