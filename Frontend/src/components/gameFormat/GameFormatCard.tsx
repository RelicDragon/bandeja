import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Pencil, HelpCircle, Users, Info } from 'lucide-react';
import { EntityType } from '@/types';
import { GameFormatSummary } from './GameFormatSummary';
import { GameFormatDetails } from './GameFormatDetails';
import { UseGameFormatResult } from '@/hooks/useGameFormat';
import {
  GameFormatGenderFields,
  GameFormatFixedTeamsToggle,
  type GameFormatTeamsBinding,
} from './GameFormatTeamsFields';
import { tScoringModeField } from '@/utils/gameFormat';
import { gameFormatFixedTeamsToggleVisible, gameFormatGenderVisible } from './gameFormatTeamsVisibility';
import { GameFormatRacketIcon } from './GameFormatRacketIcon';
import { ToggleSwitch } from '@/components/ToggleSwitch';

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
  /** When true, omit allow-multi row (e.g. draft lives in Game Settings). */
  suppressAllowMultiToggle?: boolean;
  showFixedTeamsToggle?: boolean;
  sportRow?: ReactNode;
  questionnaireBanner?: ReactNode;
  playersPerMatch?: number;
  sport?: string | null;
  /** Overrides pencil button aria-label (e.g. casual flow “Customize”). */
  wizardButtonLabel?: string;
  /** Shown when resultsByAnyone lets participants edit format. */
  participantFormatEditHint?: string;
  /** Inside CreateGameIntentPicker — no outer card chrome. */
  embedded?: boolean;
  /** Gender is rendered outside the manual card in template picker flows. */
  omitGender?: boolean;
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
  suppressAllowMultiToggle = false,
  showFixedTeamsToggle = true,
  sportRow,
  questionnaireBanner,
  playersPerMatch,
  sport,
  wizardButtonLabel,
  participantFormatEditHint,
  embedded = false,
  omitGender = false,
}: GameFormatCardProps) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const isTraining = entityType === 'TRAINING';

  const toggleExpanded = () => {
    if (isTraining) return;
    setExpanded((v) => !v);
  };

  const showGender = !omitGender && teams && gameFormatGenderVisible(entityType);
  const showFixedToggle =
    showFixedTeamsToggle && teams && gameFormatFixedTeamsToggleVisible(entityType, teams.participantCount);
  const readOnly = !!teams?.readOnly;

  const showFixedTeamsPanel =
    !!fixedTeamsPanel &&
    (fixedTeamsPanelOpen !== undefined ? fixedTeamsPanelOpen : !!teams?.hasFixedTeams);

  return (
    <div
      className={
        embedded
          ? 'overflow-hidden'
          : 'overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'
      }
    >
      <div className={`flex items-start gap-3 ${embedded ? 'pt-0.5' : 'p-4'}`}>
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
              {isTraining
                ? t('gameFormat.trainingTitle')
                : tScoringModeField(t, format.scoringMode, 'title', sport)}
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
                matchTimerEnabled={format.matchTimerEnabled}
                matchTimedCapMinutes={format.matchTimedCapMinutes}
                customPointsTotal={format.customPointsTotal}
                winnerOfGame={format.winnerOfGame}
                playersPerMatch={playersPerMatch}
                sport={sport}
                twoRows
              />
            </div>
          )}
        </motion.button>
        {showWizardButton && (
          <motion.button
            type="button"
            onClick={onOpenWizard}
            aria-label={wizardButtonLabel ?? t('gameFormat.title')}
            whileTap={{ scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 520, damping: 28 }}
            className="flex-shrink-0 self-center p-2 rounded-lg bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-500/20 active:bg-primary-200 dark:active:bg-primary-500/30 transition-colors"
          >
            <Pencil size={18} strokeWidth={2} />
          </motion.button>
        )}
      </div>

      {participantFormatEditHint ? (
        <p
          className={`${embedded ? 'px-3' : 'px-4'} pb-3 -mt-1 text-xs leading-relaxed text-primary-700 dark:text-primary-300 bg-primary-50/80 dark:bg-primary-500/10 border-b border-gray-100 dark:border-gray-800`}
        >
          {participantFormatEditHint}
        </p>
      ) : null}

      <AnimatePresence initial={false}>
        {expanded && !isTraining && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div
              className={`${embedded ? 'px-3 pb-3' : 'px-4 pb-4'} border-t border-gray-100 dark:border-gray-800 pt-3`}
            >
              <GameFormatDetails
                format={format}
                generationSlotCount={generationSlotCount}
                hasFixedTeams={teams?.hasFixedTeams}
                sport={sport}
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

      {sportRow && <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3">{sportRow}</div>}

      {questionnaireBanner}

      {showFixedToggle &&
        !suppressAllowMultiToggle &&
        teams?.hasFixedTeams &&
        teams.onAllowUserInMultipleTeamsChange &&
        teams.participantCount > 2 && (
          <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3">
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1">
              <Users size={15} className="mt-0.5 shrink-0 text-primary-600 dark:text-primary-400" aria-hidden />
              <span className="min-w-0 text-sm font-semibold text-gray-900 dark:text-white">
                {t('createGame.allowUserInMultipleTeams.title')}
              </span>
              <div className="shrink-0 justify-self-end pt-0.5">
                <ToggleSwitch
                  checked={teams.allowUserInMultipleTeams ?? false}
                  onChange={teams.onAllowUserInMultipleTeamsChange}
                  disabled={readOnly}
                />
              </div>
              <p className="col-span-3 min-w-0 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                {t('createGame.allowUserInMultipleTeams.helper')}
              </p>
            </div>
          </div>
        )}

      {showFixedToggle &&
        suppressAllowMultiToggle &&
        teams?.hasFixedTeams &&
        teams.participantCount > 2 && (
          <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3">
            <div className="flex gap-2.5">
              <Info size={16} className="mt-0.5 shrink-0 text-primary-600 dark:text-primary-400" aria-hidden />
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {t('createGame.allowUserInMultipleTeams.title')}
                </p>
                <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                  {t('createGame.allowUserInMultipleTeams.editInSettingsHint')}
                </p>
              </div>
            </div>
          </div>
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
