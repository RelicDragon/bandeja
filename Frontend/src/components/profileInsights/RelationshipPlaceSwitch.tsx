import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { RelationshipPlaceIndex } from '@/utils/profileRelationshipRankings';

const PLACE_LABEL_KEYS = [
  'playerCard.relationshipPlace1',
  'playerCard.relationshipPlace2',
  'playerCard.relationshipPlace3',
] as const;

interface RelationshipPlaceSwitchProps {
  rankCount: number;
  placeIndex: RelationshipPlaceIndex;
  onChange: (placeIndex: RelationshipPlaceIndex) => void;
}

export function RelationshipPlaceSwitch({
  rankCount,
  placeIndex,
  onChange,
}: RelationshipPlaceSwitchProps) {
  const { t } = useTranslation();
  if (rankCount < 2) return null;

  const places = (rankCount >= 3 ? [0, 1, 2] : [0, 1]) as RelationshipPlaceIndex[];

  const movePlace = (delta: number) => {
    const current = places.indexOf(placeIndex);
    const from = current === -1 ? 0 : current;
    const next = places[(from + delta + places.length) % places.length];
    if (next !== placeIndex) onChange(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      movePlace(1);
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      movePlace(-1);
    }
  };

  return (
    <div
      className={`grid rounded-full bg-gray-200/70 p-0.5 dark:bg-gray-900/55 ${
        places.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
      }`}
      aria-label={t('playerCard.relationshipPlaceSwitch')}
      role="radiogroup"
      tabIndex={0}
      data-testid="relationship-place-switch"
      onKeyDown={onKeyDown}
    >
      {places.map((place) => {
        const selected = placeIndex === place;
        return (
          <button
            key={place}
            type="button"
            className={`min-w-0 rounded-full px-2 py-1 text-[11px] font-semibold tracking-wide transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
              selected
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white'
                : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white'
            }`}
            role="radio"
            aria-checked={selected}
            tabIndex={-1}
            data-testid={`relationship-place-${place + 1}`}
            onClick={() => onChange(place)}
          >
            <span className="block truncate">{t(PLACE_LABEL_KEYS[place])}</span>
          </button>
        );
      })}
    </div>
  );
}
