import { useTranslation } from 'react-i18next';
import { EVENT_KINDS } from '@shared/entityCapabilities';
import type { EventKind } from '@/types';

const chipClass = (active: boolean) =>
  `rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
    active
      ? 'border-indigo-400 bg-indigo-100 text-indigo-800 dark:border-indigo-500 dark:bg-indigo-900/40 dark:text-indigo-200'
      : 'border-transparent bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
  }`;

type EventKindChipsProps = {
  value: EventKind | null;
  onChange: (value: EventKind) => void;
};

export function EventKindChips({ value, onChange }: EventKindChipsProps) {
  const { t } = useTranslation();

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <h2 className="section-title mb-3">{t('createEvent.kindLabel')}</h2>
      <div className="flex flex-wrap gap-2">
        {EVENT_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => onChange(kind)}
            className={chipClass(value === kind)}
            aria-pressed={value === kind}
          >
            {t(`createEvent.kinds.${kind}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
