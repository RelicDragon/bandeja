import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
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
      ? 'aspect-square rounded-lg font-bold tabular-nums text-sm sm:text-base transition-colors'
      : 'aspect-square rounded-md font-bold tabular-nums text-xs sm:text-sm transition-colors';
  if (selected) {
    return `${base} bg-primary-600 text-white ring-2 ring-primary-400 ring-offset-1 dark:ring-offset-gray-900`;
  }
  return `${base} border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 active:scale-95 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700`;
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
  const previousScoreRef = useRef(currentScore);
  const [pulseScore, setPulseScore] = useState<number | null>(null);

  useEffect(() => {
    if (currentScore !== previousScoreRef.current) {
      setPulseScore(currentScore);
      previousScoreRef.current = currentScore;
    }
  }, [currentScore]);

  useEffect(() => {
    setCustomOpen(false);
    setCustomInput('');
    previousScoreRef.current = currentScore;
    setPulseScore(null);
  }, [pickerResetKey, currentScore]);

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

  const btnClass = (selected: boolean) => numButtonClass(density, selected);

  return (
    <div className="flex w-full min-h-0 max-w-full flex-col items-stretch gap-2">
      <div className="max-h-[min(48dvh,320px)] min-h-0 touch-pan-y overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        <div className={gridClass[density]}>
          {presetValues.map(number => {
            const selected = number === currentScore;
            const shouldPulse = pulseScore === number;
            return (
              <motion.button
                key={number}
                type="button"
                onClick={() => onSelect(number)}
                animate={
                  shouldPulse
                    ? { scale: [1, 1.12, 1], transition: { duration: 0.28, ease: [0.32, 0.72, 0, 1] } }
                    : { scale: 1 }
                }
                className={btnClass(selected)}
              >
                {number}
              </motion.button>
            );
          })}
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
              className="flex-1 py-2 rounded-lg bg-primary-600 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-primary-700"
            >
              {t('common.ok')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
