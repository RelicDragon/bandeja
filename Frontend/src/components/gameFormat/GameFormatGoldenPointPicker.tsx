import { useTranslation } from 'react-i18next';
import { DEUCES_BEFORE_GOLDEN_POINT_MAX } from '@shared/gameFormat/goldenPoint';

const OPTIONS: Array<number | null> = [null, ...Array.from({ length: DEUCES_BEFORE_GOLDEN_POINT_MAX + 1 }, (_, i) => i)];

interface GameFormatGoldenPointPickerProps {
  value: number | null;
  onChange: (value: number | null) => void;
  onSelectAdvance?: () => void;
}

export const GameFormatGoldenPointPicker = ({
  value,
  onChange,
  onSelectAdvance,
}: GameFormatGoldenPointPickerProps) => {
  const { t } = useTranslation();

  return (
    <div className="mt-4 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 space-y-2.5">
      <div>
        <div className="text-sm font-medium text-gray-900 dark:text-white">
          {t('gameFormat.goldenPoint.title')}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {t('gameFormat.goldenPoint.pickerHint')}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {OPTIONS.map((opt) => {
          const selected = value === opt;
          const label =
            opt === null
              ? t('gameFormat.goldenPoint.optionOff')
              : opt === 0
                ? t('gameFormat.goldenPoint.optionImmediate')
                : t('gameFormat.goldenPoint.optionAfterDeuces', { count: opt });
          return (
            <button
              key={opt ?? 'off'}
              type="button"
              onClick={() => {
                onChange(opt);
                onSelectAdvance?.();
              }}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                selected
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
        {value === null
          ? t('gameFormat.goldenPoint.descriptionOff')
          : value === 0
            ? t('gameFormat.goldenPoint.descriptionImmediate')
            : t('gameFormat.goldenPoint.descriptionAfterDeuces', { count: value })}
      </p>
    </div>
  );
};
