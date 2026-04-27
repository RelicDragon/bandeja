import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { splitScorePickerOptions, SCORE_PICKER_PRESET_LAST_INDEX } from '@/utils/scoring';

type Density = 'comfortable' | 'compact';

const gridClass: Record<Density, string> = {
  comfortable:
    'grid grid-cols-6 sm:grid-cols-8 gap-1.5 sm:gap-2 md:gap-2.5 w-full max-w-xs sm:max-w-md px-1',
  compact: 'grid grid-cols-6 sm:grid-cols-8 gap-1 sm:gap-1.5 w-full max-w-xs sm:max-w-sm px-0',
};

function numButtonClass(density: Density, selected: boolean): string {
  const base =
    density === 'comfortable'
      ? 'aspect-square rounded-lg sm:rounded-xl font-bold text-sm sm:text-base transition-all duration-200'
      : 'aspect-square rounded-md sm:rounded-lg font-bold text-xs sm:text-sm transition-all duration-200';
  if (selected) {
    return `${base} bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-xl shadow-primary-500/40 scale-110 ring-2 ring-primary-400 ring-offset-1 sm:ring-offset-2 dark:ring-offset-gray-900`;
  }
  return `${base} bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900 text-gray-700 dark:text-gray-300 hover:from-gray-200 hover:to-gray-100 dark:hover:from-gray-700 dark:hover:to-gray-800 hover:scale-110 active:scale-95 shadow-md hover:shadow-lg border border-gray-200 dark:border-gray-700`;
}

function numButtonClassCompactSelected(selected: boolean): string {
  if (selected) {
    return 'aspect-square rounded-md sm:rounded-lg font-bold text-xs sm:text-sm transition-all duration-200 bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/40 scale-105 ring-2 ring-primary-400 ring-offset-1 dark:ring-offset-gray-900';
  }
  return 'aspect-square rounded-md sm:rounded-lg font-bold text-xs sm:text-sm transition-all duration-200 bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900 text-gray-700 dark:text-gray-300 hover:from-gray-200 hover:to-gray-100 dark:hover:from-gray-700 dark:hover:to-gray-800 hover:scale-105 active:scale-95 shadow border border-gray-200 dark:border-gray-700';
}

export type ScorePickerNumberGridProps = {
  numberOptions: number[];
  keypadMax: number;
  currentScore: number;
  onSelect: (n: number) => void;
  clampToAllowed: (value: number) => number;
  density?: Density;
  pickerResetKey: string | null;
};

export const ScorePickerNumberGrid = ({
  numberOptions,
  keypadMax,
  currentScore,
  onSelect,
  clampToAllowed,
  density = 'comfortable',
  pickerResetKey,
}: ScorePickerNumberGridProps) => {
  const { t } = useTranslation();
  const { presetValues, showMoreTile } = splitScorePickerOptions(numberOptions, keypadMax);
  const [customOpen, setCustomOpen] = useState(false);
  const [customInput, setCustomInput] = useState('');

  useEffect(() => {
    setCustomOpen(false);
    setCustomInput('');
  }, [pickerResetKey]);

  const moreSelected =
    showMoreTile &&
    (customOpen || currentScore > SCORE_PICKER_PRESET_LAST_INDEX);

  const applyCustom = () => {
    const v = parseInt(String(customInput).replace(/\s/g, ''), 10);
    if (!Number.isFinite(v)) return;
    onSelect(Math.max(0, clampToAllowed(v)));
    setCustomOpen(false);
    setCustomInput('');
  };

  const openCustom = () => {
    setCustomOpen(true);
    setCustomInput(
      currentScore > SCORE_PICKER_PRESET_LAST_INDEX ? String(currentScore) : ''
    );
  };

  const btnClass = (selected: boolean) =>
    density === 'comfortable' ? numButtonClass('comfortable', selected) : numButtonClassCompactSelected(selected);

  return (
    <div className="w-full flex flex-col items-stretch gap-2">
      <div className={gridClass[density]}>
        {presetValues.map(number => (
          <button
            key={number}
            type="button"
            onClick={() => onSelect(number)}
            className={btnClass(number === currentScore)}
          >
            {number}
          </button>
        ))}
        {showMoreTile && (
          <button
            type="button"
            onClick={openCustom}
            aria-label={t('gameResults.scorePickerOtherScore')}
            className={btnClass(moreSelected)}
          >
            ...
          </button>
        )}
      </div>
      {customOpen && (
        <div className="flex flex-col gap-2 w-full max-w-xs sm:max-w-md mx-auto px-1">
          <label className="text-xs text-gray-500 dark:text-gray-400">
            {t('gameResults.scorePickerCustomLabel', { min: 0, max: keypadMax })}
            <input
              type="number"
              min={0}
              max={keypadMax}
              inputMode="numeric"
              value={customInput}
              onChange={e => setCustomInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyCustom();
                }
              }}
              className="mt-1 w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white focus:border-primary-500 outline-none"
              autoFocus
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setCustomOpen(false);
                setCustomInput('');
              }}
              className="flex-1 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={applyCustom}
              className="flex-1 py-2 rounded-lg bg-gradient-to-r from-primary-500 to-primary-600 text-sm font-semibold text-white shadow hover:from-primary-600 hover:to-primary-700"
            >
              {t('common.ok')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
