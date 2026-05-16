import { useTranslation } from 'react-i18next';
import { Check, RotateCcw, Briefcase, Sun, Sunrise, Sunset, X } from 'lucide-react';
import type { WeeklyAvailability, AvailabilityBucketBoundaries } from '@/types';
import {
  getPresetToggleState,
  type PresetId,
  type ToggleablePresetId,
} from '@/utils/availability';

interface AvailabilityPresetsProps {
  value: WeeklyAvailability;
  boundaries: AvailabilityBucketBoundaries;
  isFullWeek: boolean;
  onApply: (preset: PresetId) => void;
}

interface PresetConfig {
  id: PresetId;
  labelKey: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  tone: string;
  activeTone: string;
}

const DAY_PRESETS: ToggleablePresetId[] = ['weekdays', 'weekends'];
const TIME_PRESETS: ToggleablePresetId[] = ['mornings', 'afternoons', 'evenings'];

const PRESET_META: Record<ToggleablePresetId, Omit<PresetConfig, 'id'>> = {
  weekdays: {
    labelKey: 'profile.availability.presets.weekdays',
    Icon: Briefcase,
    tone: 'from-blue-500/10 to-blue-500/5 text-blue-700 dark:text-blue-300 border-blue-500/20',
    activeTone: 'ring-2 ring-blue-500/50 bg-blue-500/20 dark:ring-blue-400/50 dark:bg-blue-500/25',
  },
  weekends: {
    labelKey: 'profile.availability.presets.weekends',
    Icon: Sun,
    tone: 'from-orange-500/10 to-orange-500/5 text-orange-700 dark:text-orange-300 border-orange-500/20',
    activeTone: 'ring-2 ring-orange-500/50 bg-orange-500/20 dark:ring-orange-400/50 dark:bg-orange-500/25',
  },
  mornings: {
    labelKey: 'profile.availability.presets.mornings',
    Icon: Sunrise,
    tone: 'from-amber-500/10 to-amber-500/5 text-amber-700 dark:text-amber-300 border-amber-500/20',
    activeTone: 'ring-2 ring-amber-500/50 bg-amber-500/20 dark:ring-amber-400/50 dark:bg-amber-500/25',
  },
  afternoons: {
    labelKey: 'profile.availability.presets.afternoons',
    Icon: Sun,
    tone: 'from-yellow-500/10 to-yellow-500/5 text-yellow-700 dark:text-yellow-300 border-yellow-500/20',
    activeTone: 'ring-2 ring-yellow-500/50 bg-yellow-500/20 dark:ring-yellow-400/50 dark:bg-yellow-500/25',
  },
  evenings: {
    labelKey: 'profile.availability.presets.evenings',
    Icon: Sunset,
    tone: 'from-purple-500/10 to-purple-500/5 text-purple-700 dark:text-purple-300 border-purple-500/20',
    activeTone: 'ring-2 ring-purple-500/50 bg-purple-500/20 dark:ring-purple-400/50 dark:bg-purple-500/25',
  },
};

const ACTION_PRESETS: PresetConfig[] = [
  {
    id: 'allDay',
    labelKey: 'profile.availability.resetToDefault',
    Icon: RotateCcw,
    tone: 'from-emerald-500/10 to-emerald-500/5 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
    activeTone: '',
  },
  {
    id: 'clear',
    labelKey: 'profile.availability.presets.clear',
    Icon: X,
    tone: 'from-gray-500/10 to-gray-500/5 text-gray-700 dark:text-gray-300 border-gray-500/20',
    activeTone: '',
  },
];

function PresetChip({
  id,
  labelKey,
  Icon,
  tone,
  activeTone,
  toggleState,
  onApply,
}: PresetConfig & {
  toggleState?: 'off' | 'partial' | 'on';
  onApply: (preset: PresetId) => void;
}) {
  const { t } = useTranslation();
  const isOn = toggleState === 'on';
  const isPartial = toggleState === 'partial';

  return (
    <button
      type="button"
      onClick={() => onApply(id)}
      aria-pressed={toggleState ? toggleState !== 'off' : undefined}
      className={[
        'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium',
        'bg-gradient-to-br border transition-all',
        'hover:shadow-sm hover:scale-[1.03] active:scale-95',
        tone,
        isOn && activeTone,
        isPartial && 'ring-1 ring-dashed ring-current/40 opacity-90',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {isOn ? <Check size={12} className="shrink-0" /> : <Icon size={12} className="shrink-0" />}
      {t(labelKey)}
    </button>
  );
}

export const AvailabilityPresets = ({
  value,
  boundaries,
  isFullWeek,
  onApply,
}: AvailabilityPresetsProps) => {
  const { t } = useTranslation();

  const renderToggleGroup = (ids: ToggleablePresetId[]) => (
    <div className="flex flex-wrap gap-1.5">
      {ids.map((id) => {
        const meta = PRESET_META[id];
        const toggleState = isFullWeek ? 'off' : getPresetToggleState(value, id, boundaries);
        return (
          <PresetChip
            key={id}
            id={id}
            {...meta}
            toggleState={toggleState}
            onApply={onApply}
          />
        );
      })}
    </div>
  );

  return (
    <div className="space-y-2.5">
      {isFullWeek && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t('profile.availability.presets.hintFullWeek')}
        </p>
      )}
      {!isFullWeek && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t('profile.availability.presets.hintToggle')}
        </p>
      )}
      {renderToggleGroup(DAY_PRESETS)}
      {renderToggleGroup(TIME_PRESETS)}
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        {ACTION_PRESETS.map((p) => (
          <PresetChip key={p.id} {...p} onApply={onApply} />
        ))}
      </div>
    </div>
  );
};
