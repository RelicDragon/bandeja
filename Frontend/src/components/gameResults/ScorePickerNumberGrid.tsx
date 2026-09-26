import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { splitScorePickerOptions, SCORE_PICKER_PRESET_LAST_INDEX } from '@/utils/scoring';
import {
  EASE_CLASS,
  SCORE_ENTRY_EASE,
  SCORE_ENTRY_SPRING,
  SOFT_CONTROL_CLASS,
} from '@/components/gameResults/scoreEntry/scoreEntryStyles';

type Density = 'comfortable' | 'compact';

/** Balanced rows: 0–7 reads as 4×2, 0–10 as 6+5, long point ranges as rows of 6. */
function gridColumns(cells: number): number {
  if (cells <= 4) return Math.max(cells, 1);
  if (cells <= 8) return 4;
  if (cells <= 10) return 5;
  return 6;
}

const GRID_COLUMNS_CLASS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
};

/** Wide keys (≤4 per row) get a bigger numeral; narrow ones stay legible for two digits. */
function keySizeClass(density: Density, columns: number): string {
  const wide = columns <= 4;
  if (density === 'compact') {
    return wide ? 'h-12 rounded-[0.875rem] text-xl' : 'h-10 rounded-xl text-base';
  }
  // Narrow keys stay at the 44px touch minimum so a 0–30 range fits without inner scrolling.
  return wide ? 'h-14 rounded-2xl text-[1.375rem]' : 'h-11 rounded-[0.875rem] text-lg';
}

const KEY_BASE = `relative isolate flex items-center justify-center font-brand font-semibold leading-none tabular-nums transition-[color,background-color,box-shadow] duration-300 ${EASE_CLASS} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/60`;

/*
 * Keys stay inside their own bounds: the selected state is an inset fill, not an
 * outer ring, so the scroll box and the team-slide viewport can never crop it.
 */
const KEY_IDLE =
  'bg-white text-gray-800 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_1px_0_rgba(15,23,42,0.02)] ring-1 ring-inset ring-gray-900/[0.05] hover:bg-gray-50 dark:bg-white/[0.06] dark:text-gray-100 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] dark:ring-white/[0.06] dark:hover:bg-white/[0.09]';

const KEY_SELECTED = 'text-white';

/** Springs only take two keyframes, so the pick "pop" is a short tween. */
const KEY_POP_TRANSITION = { duration: 0.34, ease: SCORE_ENTRY_EASE };
const KEY_TAP = { scale: 0.92, transition: { duration: 0.12, ease: SCORE_ENTRY_EASE } };

const SELECTED_FILL_CLASS =
  'absolute inset-0 -z-10 rounded-[inherit] bg-gradient-to-b from-primary-500 to-primary-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.28),inset_0_-1px_0_rgba(0,0,0,0.12),0_4px_10px_-4px_rgba(15,23,42,0.35)]';

/** Fades and settles in place; a fill travelling between keys would pass under later keys. */
const SelectedFill = ({ show }: { show: boolean }) => (
  <AnimatePresence initial={false}>
    {show ? (
      <motion.span
        aria-hidden
        initial={{ opacity: 0, scale: 0.82 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.92 }}
        transition={SCORE_ENTRY_SPRING}
        className={SELECTED_FILL_CLASS}
      />
    ) : null}
  </AnimatePresence>
);

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

  const columns = gridColumns(presetValues.length + (showMoreTile ? 1 : 0));
  const keySize = keySizeClass(density, columns);
  const keyClass = (selected: boolean) =>
    `${KEY_BASE} ${keySize} ${selected ? KEY_SELECTED : KEY_IDLE}`;

  return (
    <div className="flex w-full min-h-0 max-w-full flex-col items-stretch gap-2">
      {/* p-1 leaves room for each key's press pop and soft shadow inside the scroll clip. */}
      <div className="max-h-[min(48dvh,320px)] min-h-0 touch-pan-y overflow-y-auto overscroll-contain p-1 [-webkit-overflow-scrolling:touch]">
        <div className={`grid w-full ${GRID_COLUMNS_CLASS[columns]} ${density === 'comfortable' ? 'gap-2' : 'gap-1.5'}`}>
          {presetValues.map((number) => {
            const selected = number === currentScore;
            return (
              <motion.button
                key={number}
                type="button"
                onClick={() => onSelect(number)}
                aria-pressed={selected}
                initial={false}
                animate={{ scale: selected ? [1, 1.06, 1] : 1 }}
                whileTap={KEY_TAP}
                transition={KEY_POP_TRANSITION}
                className={keyClass(selected)}
              >
                <SelectedFill show={selected} />
                {number}
              </motion.button>
            );
          })}
          {showMoreTile && (
            <motion.button
              type="button"
              onClick={openCustom}
              aria-label={t('gameResults.scorePickerOtherScore')}
              aria-pressed={moreSelected}
              whileTap={KEY_TAP}
              transition={KEY_POP_TRANSITION}
              className={keyClass(moreSelected)}
            >
              <SelectedFill show={moreSelected} />
              <MoreHorizontal size={columns <= 4 ? 20 : 18} strokeWidth={1.75} aria-hidden />
            </motion.button>
          )}
        </div>
      </div>
      {customOpen && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={SCORE_ENTRY_SPRING}
          className="flex w-full flex-col gap-2.5 px-1 pb-1"
        >
          <label className="text-[12px] font-medium text-gray-500 dark:text-gray-400">
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
              className={`mt-1.5 h-12 w-full rounded-2xl bg-white px-4 font-brand text-xl font-semibold tabular-nums text-gray-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)] outline-none ring-1 ring-inset ring-gray-900/[0.08] transition-shadow duration-300 ${EASE_CLASS} focus:ring-2 focus:ring-primary-500 dark:bg-white/[0.06] dark:text-white dark:ring-white/[0.08] dark:focus:ring-primary-400`}
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
              className={`h-11 flex-1 rounded-full text-sm font-semibold text-gray-700 dark:text-gray-200 ${SOFT_CONTROL_CLASS}`}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={applyCustom}
              className={`h-11 flex-1 rounded-full bg-primary-600 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_6px_14px_-8px_rgba(15,23,42,0.5)] transition-[transform,background-color] duration-300 ${EASE_CLASS} hover:bg-primary-700 active:scale-[0.97]`}
            >
              {t('common.ok')}
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
};
