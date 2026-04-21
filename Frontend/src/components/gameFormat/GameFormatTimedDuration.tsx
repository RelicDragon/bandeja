import { useTranslation } from 'react-i18next';

const TIMED_CAP_PRESET_MINUTES = [10, 12, 15, 20] as const;

interface GameFormatTimedDurationProps {
  minutes: number;
  onChange: (minutes: number) => void;
  onSelectAdvance?: () => void;
}

export const GameFormatTimedDuration = ({ minutes, onChange, onSelectAdvance }: GameFormatTimedDurationProps) => {
  const { t } = useTranslation();
  const safe = Math.min(60, Math.max(1, minutes || 15));

  return (
    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600 space-y-3">
      <div className="text-xs font-medium text-gray-600 dark:text-gray-400">{t('gameFormat.timedMatch.durationTitle')}</div>
      <div className="flex flex-wrap gap-2">
        {TIMED_CAP_PRESET_MINUTES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              onChange(m);
              queueMicrotask(() => onSelectAdvance?.());
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              safe === m
                ? 'bg-primary-500 text-white shadow-sm'
                : 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-600 hover:border-primary-400'
            }`}
          >
            {t('gameFormat.timedMatch.presetMinutes', { minutes: m })}
          </button>
        ))}
      </div>
      <div>
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1.5">
          <span>{t('gameFormat.timedMatch.customDuration')}</span>
          <span className="font-semibold text-gray-800 dark:text-gray-200 tabular-nums">
            {t('gameFormat.timedMatch.minutesLabel', { minutes: safe })}
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={60}
          value={safe}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-2 rounded-full appearance-none cursor-pointer accent-primary-500 bg-gray-200 dark:bg-gray-700"
        />
      </div>
    </div>
  );
};
