import { useTranslation } from 'react-i18next';
import { Trophy, Target } from 'lucide-react';
import { ScoringMode } from '@/types';
import { tGameFormatStepHint, tScoringModeField } from '@/utils/gameFormat';
import { FormatOptionCard } from './FormatOptionCard';

interface GameFormatStepScoringModeProps {
  scoringMode: ScoringMode;
  allowedModes?: ScoringMode[];
  sport?: string | null;
  onChange: (mode: ScoringMode) => void;
  onSelectAdvance?: () => void;
}

const MODES: { value: ScoringMode; icon: typeof Trophy; recommended?: boolean }[] = [
  { value: 'CLASSIC', icon: Trophy, recommended: true },
  { value: 'POINTS', icon: Target },
];

export const GameFormatStepScoringMode = ({
  scoringMode,
  allowedModes,
  sport,
  onChange,
  onSelectAdvance,
}: GameFormatStepScoringModeProps) => {
  const { t } = useTranslation();
  const visibleModes =
    allowedModes && allowedModes.length > 0 ? MODES.filter((mode) => allowedModes.includes(mode.value)) : MODES;

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 dark:text-gray-400 px-1">
        {tGameFormatStepHint(t, 'scoringMode', sport)}
      </p>
      <div className="space-y-2.5">
        {visibleModes.map((m) => (
          <FormatOptionCard
            key={m.value}
            icon={m.icon}
            title={tScoringModeField(t, m.value, 'title', sport)}
            subtitle={tScoringModeField(t, m.value, 'subtitle', sport)}
            hint={tScoringModeField(t, m.value, 'hint', sport) || undefined}
            badge={m.recommended ? t('gameFormat.recommended') : undefined}
            selected={scoringMode === m.value}
            onClick={() => {
              if (scoringMode !== m.value) onChange(m.value);
              queueMicrotask(() => onSelectAdvance?.());
            }}
          />
        ))}
      </div>
    </div>
  );
};
