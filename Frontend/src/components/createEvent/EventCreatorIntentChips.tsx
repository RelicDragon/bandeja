import { useTranslation } from 'react-i18next';
import type { EventCreatorIntent } from '@/utils/createEventPayload';

const INTENTS: EventCreatorIntent[] = ['organizing', 'looking'];

const chipClass = (active: boolean) =>
  `rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
    active
      ? 'border-indigo-400 bg-indigo-100 text-indigo-800 dark:border-indigo-500 dark:bg-indigo-900/40 dark:text-indigo-200'
      : 'border-transparent bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
  }`;

type EventCreatorIntentChipsProps = {
  value: EventCreatorIntent | null;
  onChange: (value: EventCreatorIntent) => void;
};

export function EventCreatorIntentChips({ value, onChange }: EventCreatorIntentChipsProps) {
  const { t } = useTranslation();

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <div className="flex flex-wrap gap-2">
        {INTENTS.map((intent) => (
          <button
            key={intent}
            type="button"
            onClick={() => onChange(intent)}
            className={chipClass(value === intent)}
            aria-pressed={value === intent}
          >
            {t(`createEvent.${intent}`)}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{t('createEvent.organizerHint')}</p>
    </div>
  );
}
