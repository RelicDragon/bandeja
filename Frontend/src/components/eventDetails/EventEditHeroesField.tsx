import { ImagePlus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EVENT_MAX_HEROES } from '@shared/entityCapabilities';
import type { EventHeroDraft } from './eventEditTypes';

type EventEditHeroesFieldProps = {
  heroes: EventHeroDraft[];
  uploading: boolean;
  onAdd: () => void;
  onRemove: (index: number) => void;
};

export function EventEditHeroesField({ heroes, uploading, onAdd, onRemove }: EventEditHeroesFieldProps) {
  const { t } = useTranslation();

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-300">{t('createEvent.heroes')}</p>
      <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">{t('createEvent.heroesHint')}</p>
      <div className="flex flex-wrap gap-3">
        {heroes.map((hero, index) => (
          <div key={`${hero.originalUrl}-${index}`} className="relative h-20 w-28 overflow-hidden rounded-xl">
            <img src={hero.thumbnailUrl} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              className="absolute right-1 top-1 rounded-full bg-red-500 p-1 text-white"
              onClick={() => onRemove(index)}
            >
              <X size={14} />
            </button>
          </div>
        ))}
        {heroes.length < EVENT_MAX_HEROES && (
          <button
            type="button"
            onClick={onAdd}
            disabled={uploading}
            className="flex h-20 w-28 items-center justify-center rounded-xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-violet-500 hover:text-violet-600 disabled:opacity-50 dark:border-gray-600 dark:text-gray-400"
          >
            <ImagePlus size={28} strokeWidth={1.5} />
          </button>
        )}
      </div>
    </div>
  );
}
