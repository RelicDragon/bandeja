import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';

type CreateGameDurationSelectorProps = {
  duration: number;
  durationOptions: number[];
  getDurationLabel: (dur: number) => string;
  onDurationChange: (duration: number) => void;
  connectedPhone?: string | null;
};

export function CreateGameDurationSelector({
  duration,
  durationOptions,
  getDurationLabel,
  onDurationChange,
  connectedPhone,
}: CreateGameDurationSelectorProps) {
  const { t } = useTranslation();
  const durationGroupName = useId();

  const durationTabs = useMemo<SegmentedSwitchTab[]>(
    () =>
      durationOptions.map((dur) => ({
        id: String(dur),
        label: getDurationLabel(dur),
      })),
    [durationOptions, getDurationLabel],
  );

  if (durationTabs.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
          {t('createGame.duration')}
        </label>
        {connectedPhone ? (
          <span className="min-w-0 truncate text-[10px] font-medium text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-950/40 px-2 py-0.5 rounded-full">
            {t('createGame.booktime.connectedChip', { phone: connectedPhone })}
          </span>
        ) : null}
      </div>
      {durationTabs.length > 4 ? (
        <div
          className="grid grid-cols-3 gap-2"
          role="radiogroup"
          aria-label={t('createGame.duration')}
        >
          {durationTabs.map((tab) => {
            const isSelected = tab.id === String(duration);

            return (
              <label
                key={tab.id}
                className={`relative flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-2 py-2.5 text-center text-sm font-semibold transition-[background-color,border-color,color,transform,box-shadow] active:scale-[0.97] ${
                  isSelected
                    ? 'border-primary-500 bg-primary-500/15 text-primary-800 shadow-xs ring-1 ring-primary-500/20 dark:border-primary-400 dark:bg-primary-400/15 dark:text-primary-200 dark:ring-primary-400/20'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-primary-300 hover:bg-primary-50/60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-primary-500/60 dark:hover:bg-primary-950/30'
                }`}
              >
                <input
                  type="radio"
                  name={durationGroupName}
                  value={tab.id}
                  checked={isSelected}
                  onChange={() => onDurationChange(Number(tab.id))}
                  className="peer sr-only"
                />
                <span className="absolute inset-0 rounded-xl peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-white dark:peer-focus-visible:ring-primary-400 dark:peer-focus-visible:ring-offset-gray-900" />
                <span className="relative">{tab.label}</span>
              </label>
            );
          })}
        </div>
      ) : (
        <SegmentedSwitch
          tabs={durationTabs}
          activeId={String(duration)}
          onChange={(id) => onDurationChange(Number(id))}
          showOnlyActiveTabText={false}
          fullWidth
          layoutId="create-game-duration"
          ariaLabel={t('createGame.duration')}
        />
      )}
    </div>
  );
}
