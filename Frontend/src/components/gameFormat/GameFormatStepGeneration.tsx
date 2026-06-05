import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shuffle,
  TrendingUp,
  Grid3x3,
  Crown,
  ArrowUpDown,
  Trophy,
  Wand2,
  LucideIcon,
  AlertCircle,
} from 'lucide-react';
import { EntityType, MatchGenerationType, ScoringMode } from '@/types';
import type { Sport } from '@shared/sport';
import { FormatOptionCard } from './FormatOptionCard';
import {
  automaticGenerationCopyKey,
  listWizardSelectableGenerations,
} from '@/utils/gameFormat';

const GENERATION_ICONS: Partial<Record<MatchGenerationType, LucideIcon>> = {
  AUTOMATIC: Wand2,
  RANDOM: Shuffle,
  RATING: TrendingUp,
  ROUND_ROBIN: Grid3x3,
  WINNERS_COURT: Crown,
  ESCALERA: ArrowUpDown,
  KING_OF_COURT: Trophy,
};

const POPULAR_GENERATIONS = new Set<MatchGenerationType>(['RANDOM']);

interface GameFormatStepGenerationProps {
  generationType: MatchGenerationType;
  scoringMode: ScoringMode;
  entityType: EntityType;
  sport?: Sport;
  playersPerMatch?: number;
  participantCount?: number;
  maxParticipants?: number;
  hasFixedTeams?: boolean;
  onChange: (gen: MatchGenerationType) => void;
  onSelectAdvance?: () => void;
}

const genKey = (g: MatchGenerationType) =>
  g.split('_').map((s) => s.charAt(0) + s.slice(1).toLowerCase()).join('');

export const GameFormatStepGeneration = ({
  generationType,
  scoringMode,
  entityType,
  sport,
  playersPerMatch,
  participantCount,
  maxParticipants,
  hasFixedTeams,
  onChange,
  onSelectAdvance,
}: GameFormatStepGenerationProps) => {
  const { t } = useTranslation();

  const slotCount = maxParticipants ?? participantCount ?? 0;
  const available = listWizardSelectableGenerations({
    entityType,
    sport,
    playersPerMatch,
    maxParticipants,
    participantCount,
  });
  const automaticCopyKey = automaticGenerationCopyKey(slotCount > 0 ? slotCount : undefined, hasFixedTeams);

  const showClassicWarning =
    scoringMode === 'CLASSIC' &&
    (generationType === 'RANDOM' ||
      generationType === 'RATING' ||
      generationType === 'WINNERS_COURT' ||
      generationType === 'ESCALERA' ||
      generationType === 'KING_OF_COURT' ||
      generationType === 'ROUND_ROBIN');

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 dark:text-gray-400 px-1">{t('gameFormat.stepGenerationHint')}</p>
      <div className="space-y-2.5">
        {available.map((value) => {
          const icon = GENERATION_ICONS[value];
          if (!icon) return null;
          const minPlayers =
            value === 'ROUND_ROBIN'
              ? 4
              : value === 'WINNERS_COURT' || value === 'ESCALERA' || value === 'KING_OF_COURT'
                ? 8
                : undefined;
          const minCourts =
            value === 'WINNERS_COURT' || value === 'ESCALERA' || value === 'KING_OF_COURT' ? 2 : undefined;
          const metaParts: string[] = [];
          if (minPlayers) metaParts.push(t('gameFormat.minPlayers', { count: minPlayers }));
          if (minCourts && minCourts > 1) metaParts.push(t('gameFormat.minCourts', { count: minCourts }));
          const hint =
            value === 'AUTOMATIC'
              ? t(`gameFormat.generationHint.Automatic.${automaticCopyKey}`, { defaultValue: '' })
              : t(`gameFormat.generationHint.${genKey(value)}`, { defaultValue: '' });
          const combinedHint = [metaParts.join(' · '), hint].filter(Boolean).join(' — ');
          const subtitle =
            value === 'AUTOMATIC'
              ? t(`gameFormat.generation.Automatic.subtitle.${automaticCopyKey}`)
              : t(`gameFormat.generation.${genKey(value)}.subtitle`);
          return (
            <FormatOptionCard
              key={value}
              icon={icon}
              title={t(`gameFormat.generation.${genKey(value)}.title`)}
              subtitle={subtitle}
              hint={combinedHint || undefined}
              badge={POPULAR_GENERATIONS.has(value) && scoringMode !== 'CLASSIC' ? t('gameFormat.popular') : undefined}
              selected={generationType === value}
              onClick={() => {
                onChange(value);
                onSelectAdvance?.();
              }}
            />
          );
        })}
      </div>

      <AnimatePresence initial={false}>
        {showClassicWarning && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-xs text-amber-800 dark:text-amber-300">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{t('gameFormat.classicWithRotationWarning')}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
