import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button, GameFormatCard } from '@/components';
import { CreateGameIntentPicker } from '@/components/createGame/CreateGameIntentPicker';
import { useGameFormat } from '@/hooks/useGameFormat';
import { useGameFormatTemplateFlow } from '@/hooks/useGameFormatTemplateFlow';
import { useClampGameFormatToSport } from '@/hooks/useSportGameFormatLimits';
import { useAuthStore } from '@/store/authStore';
import type { Game, GameSetupParams } from '@/types';
import type { CreateTemplateParticipantContext } from '@/sport/createTemplateParticipantFit';
import { buildEditTemplateDurationContext } from '@/utils/gameFormat/buildEditTemplateDurationContext';
import { inferTemplateFromFormat } from '@/utils/gameFormat/templateFormatCoordinator';
import { parseGameSport } from '@/utils/gameSport';
import { playersPerMatchOf } from '@/utils/matchFormat';
import {
  bracketPlayoffFormatInitialFromSeason,
  bracketPlayoffFormatSnapshot,
} from './playoffTemplates';
import { PlayoffGameFormatWizard } from './PlayoffGameFormatWizard';

interface BracketPlayoffGameSetupStepProps {
  seasonGame: Game;
  initialSetup?: GameSetupParams | null;
  onBack: () => void;
  onConfirm: (params: GameSetupParams) => void;
  submitting: boolean;
}

export const BracketPlayoffGameSetupStep = ({
  seasonGame,
  initialSetup = null,
  onBack,
  onConfirm,
  submitting,
}: BracketPlayoffGameSetupStepProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const seasonSport = parseGameSport(seasonGame.sport);
  const formatInitial = useMemo(
    () => bracketPlayoffFormatInitialFromSeason(seasonGame, initialSetup),
    [seasonGame, initialSetup],
  );
  const gameFormat = useGameFormat(formatInitial, {
    skipGenerationParticipantDefaults: true,
    preserveInitialGeneration: true,
  });
  const sportFormatLimits = useClampGameFormatToSport(seasonSport, gameFormat);
  const { sportConfig, allowedScoringPresets } = sportFormatLimits;
  const playersPerMatch = playersPerMatchOf(formatInitial) === 2 ? 2 : 4;
  const maxParticipants = playersPerMatch;
  const participantContext = useMemo(
    (): CreateTemplateParticipantContext => ({
      maxParticipants,
      playersPerMatch,
      hasFixedTeams: true,
      genderTeams: seasonGame.genderTeams,
      lockPlayersPerMatch: true,
    }),
    [maxParticipants, playersPerMatch, seasonGame.genderTeams],
  );
  const templateInitial = useMemo(
    () =>
      inferTemplateFromFormat(
        {
          sport: seasonSport,
          maxParticipants,
          allowedScoringPresets,
          participantContext,
          entityType: 'GAME',
        },
        formatInitial,
        bracketPlayoffFormatSnapshot(formatInitial),
      ),
    [allowedScoringPresets, formatInitial, maxParticipants, participantContext, seasonSport],
  );
  const [wizardOpen, setWizardOpen] = useState(false);
  const templateFlow = useGameFormatTemplateFlow({
    enabled: true,
    sport: seasonSport,
    maxParticipants,
    gameFormat,
    allowedScoringPresets,
    presetMeta: sportConfig.presetMeta,
    participantContext,
    initial: templateInitial,
    skipInitialAutoSelect: true,
    preserveInitialFormat: true,
    formatWizardOpen: wizardOpen,
    entityType: 'GAME',
  });

  const handleOpenWizard = () => {
    templateFlow.notifyFormatWizardOpen();
    setWizardOpen(true);
  };

  const handleCloseWizard = () => {
    templateFlow.handleWizardClose();
    setWizardOpen(false);
  };

  const handleConfirm = () => {
    onConfirm({
      ...gameFormat.setupPayload,
      scoringMode: gameFormat.scoringMode,
    });
  };

  const durationContext = useMemo(
    () =>
      buildEditTemplateDurationContext(
        seasonGame,
        seasonSport,
        maxParticipants,
        playersPerMatch,
        gameFormat,
        templateFlow.activeTemplateId,
        user,
      ),
    [
      gameFormat,
      maxParticipants,
      playersPerMatch,
      seasonGame,
      seasonSport,
      templateFlow.activeTemplateId,
      user,
    ],
  );

  const formatSection = templateFlow.isCustom ? (
    <GameFormatCard
      embedded
      entityType="GAME"
      format={gameFormat}
      playersPerMatch={playersPerMatch}
      sport={seasonSport}
      generationSlotCount={maxParticipants}
      onOpenWizard={handleOpenWizard}
      showFixedTeamsToggle={false}
    />
  ) : undefined;

  return (
    <div className="space-y-4">
      <CreateGameIntentPicker
        collapsible
        sport={seasonSport}
        allowedScoringPresets={allowedScoringPresets}
        participantContext={participantContext}
        selectedTemplateId={templateFlow.activeTemplateId}
        isCustom={templateFlow.isCustom}
        showManualCard={templateFlow.showManualCard}
        onSelectTemplate={templateFlow.handleTemplateSelect}
        onSelectCustom={templateFlow.handleCustomSelect}
        isRatingGame={seasonGame.affectsRating ?? false}
        onRatingGameChange={() => undefined}
        showRatingToggle={false}
        scoringPreset={gameFormat.scoringPreset}
        matchTimedCapMinutes={gameFormat.matchTimedCapMinutes}
        onAmericanoPointsChange={templateFlow.handleAmericanoPointsChange}
        onTimedMinutesChange={templateFlow.handleTimedMinutesChange}
        durationContext={durationContext}
        customMatchGenerationType={gameFormat.generationType}
        customGameType={gameFormat.gameType}
        customMatchTimerEnabled={gameFormat.matchTimerEnabled}
        customCustomPointsTotal={gameFormat.customPointsTotal}
        formatSection={formatSection}
        onOpenFormatWizard={handleOpenWizard}
        formatWizardCustomizeLabel={templateFlow.formatWizardCustomizeLabel}
      />
      <PlayoffGameFormatWizard
        isOpen={wizardOpen}
        format={gameFormat}
        sport={seasonSport}
        entityType="GAME"
        generationSlotCount={maxParticipants}
        playersPerMatch={playersPerMatch}
        hasFixedTeams
        allowedScoringPresets={templateFlow.wizardAllowedPresets}
        onClose={handleCloseWizard}
      />
      <div className="flex gap-2 border-t border-gray-200 dark:border-gray-700 pt-3">
        <Button variant="outline" onClick={onBack} className="flex-1" disabled={submitting}>
          {t('common.back', { defaultValue: 'Back' })}
        </Button>
        <Button onClick={handleConfirm} disabled={submitting} className="flex-1">
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              {t('common.loading')}
            </>
          ) : (
            t('common.next', { defaultValue: 'Next' })
          )}
        </Button>
      </div>
    </div>
  );
};
