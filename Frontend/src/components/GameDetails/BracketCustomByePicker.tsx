import { useTranslation } from 'react-i18next';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { toggleCustomByeSeedRank } from '@/utils/customByeSeedRanks.util';
import { formatSeedOptionLabel } from '@/utils/playoffWizardSeedLabels.util';
import {
  customByeErrorI18nKey,
  getCustomByeValidation,
} from '@/utils/playoffWizardValidation.util';
import { useMemo } from 'react';

interface BracketCustomByePickerProps {
  entrantCount: number;
  byeCount: number;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  selectedRanks: number[];
  onSelectedRanksChange: (ranks: number[]) => void;
  seedLabels?: Record<number, string>;
}

export function BracketCustomByePicker({
  entrantCount,
  byeCount,
  enabled,
  onEnabledChange,
  selectedRanks,
  onSelectedRanksChange,
  seedLabels,
}: BracketCustomByePickerProps) {
  const { t } = useTranslation();
  const validation = useMemo(
    () => getCustomByeValidation(entrantCount, enabled, selectedRanks),
    [entrantCount, enabled, selectedRanks]
  );
  if (byeCount <= 0) return null;

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/40">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200 min-w-0 pr-2">
          {t('gameDetails.bracketCustomByesLabel')}
        </span>
        <div className="flex-shrink-0">
          <ToggleSwitch
            checked={enabled}
            onChange={(on) => {
              onEnabledChange(on);
              if (!on) onSelectedRanksChange([]);
            }}
          />
        </div>
      </div>
      {enabled && (
        <>
          <p className="text-center text-xs text-gray-600 dark:text-gray-400">
            {t('gameDetails.bracketCustomByesHint', { count: byeCount })}
          </p>
          {enabled && !validation.valid && (
            <p className="text-center text-xs text-amber-600 dark:text-amber-400">
              {t(customByeErrorI18nKey(validation.error), {
                defaultValue: 'Invalid custom bye selection',
              })}
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-1.5">
            {Array.from({ length: entrantCount }, (_, i) => i + 1).map((seed) => {
              const selected = selectedRanks.includes(seed);
              const full = !selected && selectedRanks.length >= byeCount;
              const label = formatSeedOptionLabel(seed, seedLabels);
              const teamName = seedLabels?.[seed];
              return (
                <button
                  key={seed}
                  type="button"
                  title={label}
                  disabled={full}
                  onClick={() =>
                    onSelectedRanksChange(toggleCustomByeSeedRank(selectedRanks, seed, byeCount))
                  }
                  className={`max-w-[7.5rem] rounded-md px-2 py-1 text-xs font-bold transition ${
                    selected
                      ? 'bg-primary-600 text-white shadow-sm'
                      : full
                        ? 'cursor-not-allowed bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600'
                        : 'bg-white text-gray-800 ring-1 ring-gray-200 hover:ring-primary-400 dark:bg-gray-900 dark:text-gray-100 dark:ring-gray-600'
                  }`}
                >
                  <span className="block">{seed}</span>
                  {teamName ? (
                    <span className="block truncate text-[10px] font-normal opacity-90">{teamName}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <p className="text-center text-[11px] text-gray-500 dark:text-gray-500">
            {t('gameDetails.bracketCustomByesSelected', {
              selected: selectedRanks.length,
              total: byeCount,
            })}
          </p>
        </>
      )}
    </div>
  );
}
