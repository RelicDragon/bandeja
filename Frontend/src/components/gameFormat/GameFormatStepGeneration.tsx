import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Pencil,
  Shuffle,
  TrendingUp,
  Grid3x3,
  Crown,
  ArrowUpDown,
  Sliders,
  Wand2,
  LucideIcon,
  AlertCircle,
} from 'lucide-react';
import { EntityType, MatchGenerationType, ScoringMode } from '@/types';
import { FormatOptionCard } from './FormatOptionCard';
import { allowedGenerationsForMaxParticipants, automaticGenerationCopyKey } from '@/utils/gameFormat';

interface GenerationDef {
  value: MatchGenerationType;
  icon: LucideIcon;
  entityTypes?: EntityType[];
  minPlayers?: number;
  minCourts?: number;
  popular?: boolean;
}

const GENERATION_DEFS: GenerationDef[] = [
  { value: 'HANDMADE', icon: Pencil },
  { value: 'AUTOMATIC', icon: Wand2 },
  { value: 'RANDOM', icon: Shuffle, popular: true },
  { value: 'RATING', icon: TrendingUp },
  { value: 'ROUND_ROBIN', icon: Grid3x3, minPlayers: 4, entityTypes: ['TOURNAMENT', 'LEAGUE', 'LEAGUE_SEASON'] },
  { value: 'WINNERS_COURT', icon: Crown, minPlayers: 8, minCourts: 2, entityTypes: ['TOURNAMENT', 'LEAGUE', 'LEAGUE_SEASON'] },
  { value: 'ESCALERA', icon: ArrowUpDown, minPlayers: 8, minCourts: 2, entityTypes: ['TOURNAMENT', 'LEAGUE', 'LEAGUE_SEASON'] },
  { value: 'FIXED', icon: Sliders },
];

const DEF_BY_VALUE = new Map(GENERATION_DEFS.map((d) => [d.value, d]));

interface GameFormatStepGenerationProps {
  generationType: MatchGenerationType;
  scoringMode: ScoringMode;
  entityType: EntityType;
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
  participantCount,
  maxParticipants,
  hasFixedTeams,
  onChange,
  onSelectAdvance,
}: GameFormatStepGenerationProps) => {
  const { t } = useTranslation();

  const slotCount = maxParticipants ?? participantCount ?? 0;
  const allowedOrder = allowedGenerationsForMaxParticipants(slotCount > 0 ? slotCount : undefined);

  const effectiveEntityType: EntityType =
    entityType === 'GAME' && slotCount > 4 ? 'TOURNAMENT' : entityType;

  const countForRules = slotCount > 0 ? slotCount : (participantCount ?? 0);
  const automaticCopyKey = automaticGenerationCopyKey(slotCount > 0 ? slotCount : undefined, hasFixedTeams);

  const available: GenerationDef[] = allowedOrder
    .map((v) => DEF_BY_VALUE.get(v))
    .filter((g): g is GenerationDef => {
      if (!g) return false;
      if (g.entityTypes && !g.entityTypes.includes(effectiveEntityType)) return false;
      if (g.minPlayers && countForRules < g.minPlayers) return false;
      return true;
    });

  const showClassicWarning =
    scoringMode === 'CLASSIC' &&
    (generationType === 'RANDOM' ||
      generationType === 'RATING' ||
      generationType === 'WINNERS_COURT' ||
      generationType === 'ESCALERA' ||
      generationType === 'ROUND_ROBIN');

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 dark:text-gray-400 px-1">{t('gameFormat.stepGenerationHint')}</p>
      <div className="space-y-2.5">
        {available.map((g) => {
          const metaParts: string[] = [];
          if (g.minPlayers) metaParts.push(t('gameFormat.minPlayers', { count: g.minPlayers }));
          if (g.minCourts && g.minCourts > 1) metaParts.push(t('gameFormat.minCourts', { count: g.minCourts }));
          const hint =
            g.value === 'AUTOMATIC'
              ? t(`gameFormat.generationHint.Automatic.${automaticCopyKey}`, { defaultValue: '' })
              : t(`gameFormat.generationHint.${genKey(g.value)}`, { defaultValue: '' });
          const combinedHint = [metaParts.join(' · '), hint].filter(Boolean).join(' — ');
          const subtitle =
            g.value === 'AUTOMATIC'
              ? t(`gameFormat.generation.Automatic.subtitle.${automaticCopyKey}`)
              : t(`gameFormat.generation.${genKey(g.value)}.subtitle`);
          return (
            <FormatOptionCard
              key={g.value}
              icon={g.icon}
              title={t(`gameFormat.generation.${genKey(g.value)}.title`)}
              subtitle={subtitle}
              hint={combinedHint || undefined}
              badge={g.popular && scoringMode !== 'CLASSIC' ? t('gameFormat.popular') : undefined}
              selected={generationType === g.value}
              onClick={() => {
                onChange(g.value);
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
