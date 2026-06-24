import { useMemo } from 'react';
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
    <div className="flex flex-col items-center gap-2">
      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
        {t('createGame.duration')}
      </label>
      {connectedPhone ? (
        <span className="text-[10px] font-medium text-primary-700 dark:text-primary-300 bg-primary-50 dark:bg-primary-950/40 px-2 py-0.5 rounded-full">
          {t('createGame.booktime.connectedChip', { phone: connectedPhone })}
        </span>
      ) : null}
      <SegmentedSwitch
        tabs={durationTabs}
        activeId={String(duration)}
        onChange={(id) => onDurationChange(Number(id))}
        showOnlyActiveTabText={false}
        layoutId="create-game-duration"
        ariaLabel={t('createGame.duration')}
      />
    </div>
  );
}
