import { useTranslation } from 'react-i18next';
import { RotateCcw, Briefcase, Sun, Sunrise, Sunset, X } from 'lucide-react';
import type { PresetId } from '@/utils/availability';

interface AvailabilityPresetsProps {
  onApply: (preset: PresetId) => void;
}

interface PresetConfig {
  id: PresetId;
  labelKey: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  tone: string;
}

const PRESETS: PresetConfig[] = [
  { id: 'allDay', labelKey: 'profile.availability.resetToDefault', Icon: RotateCcw, tone: 'from-emerald-500/10 to-emerald-500/5 text-emerald-700 dark:text-emerald-300 border-emerald-500/20' },
  { id: 'weekdays', labelKey: 'profile.availability.presets.weekdays', Icon: Briefcase, tone: 'from-blue-500/10 to-blue-500/5 text-blue-700 dark:text-blue-300 border-blue-500/20' },
  { id: 'weekends', labelKey: 'profile.availability.presets.weekends', Icon: Sun, tone: 'from-orange-500/10 to-orange-500/5 text-orange-700 dark:text-orange-300 border-orange-500/20' },
  { id: 'mornings', labelKey: 'profile.availability.presets.mornings', Icon: Sunrise, tone: 'from-amber-500/10 to-amber-500/5 text-amber-700 dark:text-amber-300 border-amber-500/20' },
  { id: 'afternoons', labelKey: 'profile.availability.presets.afternoons', Icon: Sun, tone: 'from-yellow-500/10 to-yellow-500/5 text-yellow-700 dark:text-yellow-300 border-yellow-500/20' },
  { id: 'evenings', labelKey: 'profile.availability.presets.evenings', Icon: Sunset, tone: 'from-purple-500/10 to-purple-500/5 text-purple-700 dark:text-purple-300 border-purple-500/20' },
  { id: 'clear', labelKey: 'profile.availability.presets.clear', Icon: X, tone: 'from-gray-500/10 to-gray-500/5 text-gray-700 dark:text-gray-300 border-gray-500/20' },
];

export const AvailabilityPresets = ({ onApply }: AvailabilityPresetsProps) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-1.5">
      {PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onApply(p.id)}
          className={[
            'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium',
            'bg-gradient-to-br border transition-all',
            'hover:shadow-sm hover:scale-[1.03] active:scale-95',
            p.tone,
          ].join(' ')}
        >
          <p.Icon size={12} />
          {t(p.labelKey)}
        </button>
      ))}
    </div>
  );
};
