import { useTranslation } from 'react-i18next';
import { Trophy, Target } from 'lucide-react';
import { ScoringMode } from '@/types';
import { FormatOptionCard } from './FormatOptionCard';

interface GameFormatStepScoringModeProps {
  scoringMode: ScoringMode;
  onChange: (mode: ScoringMode) => void;
  onSelectAdvance?: () => void;
}

const MODES: { value: ScoringMode; icon: typeof Trophy; recommended?: boolean }[] = [
  { value: 'CLASSIC', icon: Trophy, recommended: true },
  { value: 'POINTS', icon: Target },
];

export const GameFormatStepScoringMode = ({ scoringMode, onChange, onSelectAdvance }: GameFormatStepScoringModeProps) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 dark:text-gray-400 px-1">{t('gameFormat.stepScoringModeHint')}</p>
      <div className="space-y-2.5">
        {MODES.map((m) => (
          <FormatOptionCard
            key={m.value}
            icon={m.icon}
            title={t(`gameFormat.scoringMode.${m.value}.title`)}
            subtitle={t(`gameFormat.scoringMode.${m.value}.subtitle`)}
            hint={t(`gameFormat.scoringMode.${m.value}.hint`, { defaultValue: '' }) || undefined}
            badge={m.recommended ? t('gameFormat.recommended') : undefined}
            selected={scoringMode === m.value}
            onClick={() => {
              onChange(m.value);
              queueMicrotask(() => onSelectAdvance?.());
            }}
          />
        ))}
      </div>
    </div>
  );
};
