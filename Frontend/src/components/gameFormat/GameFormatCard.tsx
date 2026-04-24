import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Pencil, HelpCircle } from 'lucide-react';
import { EntityType } from '@/types';
import { GameFormatSummary } from './GameFormatSummary';
import { GameFormatDetails } from './GameFormatDetails';
import { UseGameFormatResult } from '@/hooks/useGameFormat';
import {
  GameFormatGenderFields,
  GameFormatFixedTeamsToggle,
  type GameFormatTeamsBinding,
} from './GameFormatTeamsFields';
import { gameFormatFixedTeamsToggleVisible, gameFormatGenderVisible } from './gameFormatTeamsVisibility';
import { GameFormatRacketIcon } from './GameFormatRacketIcon';

interface GameFormatCardProps {
  entityType: EntityType;
  format: UseGameFormatResult;
  /** Used for Automatic matchup description (2 vs 4 players). */
  generationSlotCount?: number;
  onOpenWizard: () => void;
  teams?: GameFormatTeamsBinding;
  fixedTeamsPanel?: ReactNode;
  /** When set, overrides `teams?.hasFixedTeams` for showing the fixed-teams panel */
  fixedTeamsPanelOpen?: boolean;
  showWizardButton?: boolean;
}

export const GameFormatCard = ({
  entityType,
  format,
  generationSlotCount,
  onOpenWizard,
  teams,
  fixedTeamsPanel,
  fixedTeamsPanelOpen,
  showWizardButton = true,
}: GameFormatCardProps) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const isTraining = entityType === 'TRAINING';

  const toggleExpanded = () => {
    if (isTraining) return;
    setExpanded((v) => !v);
  };

  const titleKey = `gameFormat.scoringMode.${format.scoringMode}.title` as const;

  const showGender = teams && gameFormatGenderVisible(entityType);
  const showFixedToggle = teams && gameFormatFixedTeamsToggleVisible(entityType, teams.participantCount);
  const readOnly = !!teams?.readOnly;

  const showFixedTeamsPanel =
    !!fixedTeamsPanel &&
    (fixedTeamsPanelOpen !== undefined ? fixedTeamsPanelOpen : !!teams?.hasFixedTeams);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <motion.button
          type="button"
          onClick={toggleExpanded}
          disabled={isTraining}
          aria-expanded={expanded}
          aria-label={expanded ? t('common.hideDetails') : t('common.showDetails')}
          whileTap={isTraining ? undefined : { scale: 0.985 }}
          transition={{ type: 'spring', stiffness: 520, damping: 28 }}
          className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 items-start text-left hover:opacity-90 active:opacity-80 transition-opacity disabled:cursor-default rounded-lg -m-1 p-1"
        >
          <GameFormatRacketIcon size={15} className="row-start-1 shrink-0 text-primary-600 dark:text-primary-400 mt-0.5" />
          <div className="row-start-1 flex min-w-0 items-center gap-1.5">
            <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {isTraining ? t('gameFormat.trainingTitle') : t(titleKey)}
            </div>
            {!isTraining && (
              <motion.span
                key={expanded ? 'fmt-open' : 'fmt-closed'}
                className="flex-shrink-0 inline-flex text-gray-400 dark:text-gray-500"
                aria-hidden
                initial={{ scale: 0.82, opacity: 0.75 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 480, damping: 18 }}
              >
                <HelpCircle size={14} strokeWidth={2} />
              </motion.span>
            )}
          </div>
          {!isTraining && (
            <div className="col-span-2 row-start-2 min-w-0 text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
              <GameFormatSummary
                scoringMode={format.scoringMode}
                scoringPreset={format.scoringPreset}
                generationType={format.generationType}
                hasGoldenPoint={format.hasGoldenPoint}
                isTimed={format.isTimed}
                matchTimedCapMinutes={format.matchTimedCapMinutes}
                customPointsTotal={format.customPointsTotal}
                twoRows
              />
            </div>
          )}
        </motion.button>
        {showWizardButton && (
          <motion.button
            type="button"
            onClick={onOpenWizard}
            aria-label={t('gameFormat.title')}
            whileTap={{ scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 520, damping: 28 }}
            className="flex-shrink-0 self-center p-2 rounded-lg bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-500/20 active:bg-primary-200 dark:active:bg-primary-500/30 transition-colors"
          >
            <Pencil size={18} strokeWidth={2} />
          </motion.button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {expanded && !isTraining && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-800 pt-3">
              <GameFormatDetails
                format={format}
                generationSlotCount={generationSlotCount}
                hasFixedTeams={teams?.hasFixedTeams}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showGender && (
        <GameFormatGenderFields
          entityType={entityType}
          genderTeams={teams!.genderTeams}
          onGenderTeamsChange={teams!.onGenderTeamsChange}
          genderSwitchLayoutId={teams!.genderSwitchLayoutId ?? 'gameFormatCardTeamsGender'}
          readOnly={readOnly}
          className="px-4 py-3"
        />
      )}

      {showFixedToggle && (
        <GameFormatFixedTeamsToggle
          entityType={entityType}
          participantCount={teams!.participantCount}
          hasFixedTeams={teams!.hasFixedTeams}
          onHasFixedTeamsChange={teams!.onHasFixedTeamsChange}
          readOnly={readOnly}
          className="border-t border-gray-100 dark:border-gray-800 px-4 py-3"
        />
      )}

      <AnimatePresence initial={false}>
        {showFixedTeamsPanel && (
          <motion.div
            key="fixed-teams-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3">{fixedTeamsPanel}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
