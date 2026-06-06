import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  GameFormatCard,
  GameFormatGenderFields,
  GameFormatWizard,
  gameFormatTeamsFieldsVisible,
  type GameFormatTeamsBinding,
} from '@/components/gameFormat';
import { gameFormatGenderVisible } from '@/components/gameFormat/gameFormatTeamsVisibility';
import { FixedTeamsManagement } from '@/components/GameDetails/FixedTeamsManagement';
import { CreateGameIntentPicker } from '@/components/createGame/CreateGameIntentPicker';
import { useGameFormat } from '@/hooks/useGameFormat';
import { useGameFormatTemplateFlow } from '@/hooks/useGameFormatTemplateFlow';
import { gamesApi } from '@/api';
import { useClampGameFormatToSport } from '@/hooks/useSportGameFormatLimits';
import { playersPerMatchOf } from '@/utils/matchFormat';
import { Game, GenderTeam } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { listCreateFlowSports } from '@/utils/profileSports';
import type { CreateTemplateParticipantContext } from '@/sport/createTemplateParticipantFit';
import { showGameFormatTemplatePicker } from '@/utils/gameFormat/showGameFormatTemplatePicker';
import { inferTemplateFromFormat } from '@/utils/gameFormat/templateFormatCoordinator';
import { buildGameFormatUpdatePayload } from '@/utils/gameFormat/buildGameFormatUpdatePayload';
import { buildEditTemplateDurationContext } from '@/utils/gameFormat/buildEditTemplateDurationContext';
import { parseGameSport } from '@/utils/gameSport';
import type { CreateTemplate } from '@/sport/createFlow';

interface GameFormatSectionProps {
  game: Game;
  canEdit: boolean;
  onGameUpdate: (game: Game) => void;
  /** Hide allow-multi on format card while Settings edit mode uses the draft (single control). */
  suppressAllowMultiToggle?: boolean;
}

export const GameFormatSection = ({ game, canEdit, onGameUpdate, suppressAllowMultiToggle }: GameFormatSectionProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const sport = parseGameSport(game.sport);
  const formatMaxParticipants = game.entityType === 'LEAGUE_SEASON' ? 4 : game.maxParticipants;
  const enabledSports = useMemo(() => listCreateFlowSports(user), [user]);
  const showTemplatePicker = showGameFormatTemplatePicker(game.entityType, sport, enabledSports);
  const gameFormat = useGameFormat(
    {
      ...game,
      maxParticipants: formatMaxParticipants,
    },
    { skipGenerationParticipantDefaults: showTemplatePicker },
  );
  const gameFormatRef = useRef(gameFormat);
  gameFormatRef.current = gameFormat;
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const maxParticipants = formatMaxParticipants ?? 0;
  const genderTeams = (game.genderTeams || 'ANY') as GenderTeam;
  const hasFixedTeams = maxParticipants === 2 ? false : (game.hasFixedTeams || false);
  const playersPerMatch = (playersPerMatchOf(game) === 4 ? 4 : 2) as 2 | 4;
  const sportFormatLimits = useClampGameFormatToSport(
    game.sport,
    gameFormat,
    canEdit,
    maxParticipants,
    playersPerMatch,
  );
  const { sportConfig, allowedScoringModes, allowedScoringPresets } = sportFormatLimits;

  const templateParticipantContext = useMemo(
    (): CreateTemplateParticipantContext => ({
      maxParticipants,
      playersPerMatch,
      hasFixedTeams,
      genderTeams,
    }),
    [maxParticipants, playersPerMatch, hasFixedTeams, genderTeams],
  );

  const templateInitial = useMemo(
    () =>
      inferTemplateFromFormat(
        {
          sport,
          maxParticipants,
          allowedScoringPresets,
          participantContext: templateParticipantContext,
        },
        game,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bootstrap when game identity / roster shape changes
    [game.id, sport, maxParticipants, playersPerMatch, hasFixedTeams, genderTeams],
  );

  const persistFormat = useCallback(
    async (playersPerMatchOverride?: number, affectsRating?: boolean) => {
      if (!canEdit) return;
      try {
        const body = buildGameFormatUpdatePayload({
          entityType: game.entityType,
          gameFormat: gameFormatRef.current,
          playersPerMatch: playersPerMatchOverride ?? playersPerMatchOf(game),
          affectsRating,
        });
        await gamesApi.update(game.id, body);
        const response = await gamesApi.getById(game.id);
        onGameUpdate(response.data);
        toast.success(t('gameResults.setupUpdated'));
      } catch (error: unknown) {
        const err = error as { response?: { data?: { message?: string } } };
        const errorMessage = err.response?.data?.message || 'errors.generic';
        toast.error(t(errorMessage, { defaultValue: errorMessage }));
      }
    },
    [canEdit, game, onGameUpdate, t],
  );

  const onAfterTemplateApply = useCallback(
    async (template: CreateTemplate) => {
      await persistFormat(undefined, template.affectsRating);
    },
    [persistFormat],
  );

  const templateFlow = useGameFormatTemplateFlow({
    enabled: showTemplatePicker,
    sport,
    maxParticipants,
    gameFormat,
    allowedScoringPresets,
    presetMeta: sportConfig.presetMeta,
    participantContext: templateParticipantContext,
    initial: templateInitial,
    skipInitialAutoSelect: true,
    formatWizardOpen: isWizardOpen,
    onAfterTemplateApply: canEdit ? onAfterTemplateApply : undefined,
  });
  const { handleWizardClose, notifyFormatWizardOpen, runInitialBootstrap } = templateFlow;

  useLayoutEffect(() => {
    if (!showTemplatePicker) return;
    runInitialBootstrap(templateInitial.intent, templateInitial.templateId);
  }, [showTemplatePicker, templateInitial.intent, templateInitial.templateId, runInitialBootstrap]);

  const closeFormatWizard = useCallback(() => {
    handleWizardClose();
    setIsWizardOpen(false);
  }, [handleWizardClose]);

  const templateDurationContext = useMemo(
    () =>
      buildEditTemplateDurationContext(
        game,
        sport,
        maxParticipants,
        playersPerMatch,
        gameFormat,
        templateFlow.selectedTemplateId,
        user,
      ),
    [
      game,
      sport,
      maxParticipants,
      playersPerMatch,
      gameFormat,
      templateFlow.selectedTemplateId,
      user,
    ],
  );

  const persistTeams = useCallback(
    async (patch: { genderTeams?: GenderTeam; hasFixedTeams?: boolean; allowUserInMultipleTeams?: boolean }) => {
      if (!canEdit) return;
      try {
        const body: Partial<Game> = {};
        if (patch.genderTeams !== undefined) body.genderTeams = patch.genderTeams;
        if (patch.hasFixedTeams !== undefined) {
          body.hasFixedTeams = game.maxParticipants === 2 ? false : patch.hasFixedTeams;
          if (patch.hasFixedTeams === false) {
            body.allowUserInMultipleTeams = false;
          }
        }
        if (patch.allowUserInMultipleTeams !== undefined) {
          const fixedOn =
            game.maxParticipants === 2
              ? false
              : patch.hasFixedTeams !== undefined
                ? patch.hasFixedTeams
                : (game.hasFixedTeams ?? false);
          body.allowUserInMultipleTeams = fixedOn ? patch.allowUserInMultipleTeams : false;
        }
        await gamesApi.update(game.id, body);
        const response = await gamesApi.getById(game.id);
        onGameUpdate(response.data);
      } catch (error: unknown) {
        const err = error as { response?: { data?: { message?: string } } };
        const errorMessage = err.response?.data?.message || 'errors.generic';
        toast.error(t(errorMessage, { defaultValue: errorMessage }));
      }
    },
    [canEdit, game.id, game.maxParticipants, game.hasFixedTeams, onGameUpdate, t],
  );

  const handleRatingGameChange = useCallback(
    async (checked: boolean) => {
      if (!canEdit) return;
      try {
        await gamesApi.update(game.id, { affectsRating: checked });
        const response = await gamesApi.getById(game.id);
        onGameUpdate(response.data);
      } catch (error: unknown) {
        const err = error as { response?: { data?: { message?: string } } };
        const errorMessage = err.response?.data?.message || 'errors.generic';
        toast.error(t(errorMessage, { defaultValue: errorMessage }));
      }
    },
    [canEdit, game.id, onGameUpdate, t],
  );

  const teamsForCard: GameFormatTeamsBinding | undefined = gameFormatTeamsFieldsVisible(
    game.entityType,
    maxParticipants,
  )
    ? {
        participantCount: maxParticipants,
        genderTeams,
        hasFixedTeams,
        onGenderTeamsChange: (v) => {
          if (canEdit) void persistTeams({ genderTeams: v });
        },
        onHasFixedTeamsChange: (v) => {
          if (canEdit) void persistTeams({ hasFixedTeams: v });
        },
        allowUserInMultipleTeams:
          maxParticipants === 2 ? false : (game.allowUserInMultipleTeams ?? false),
        onAllowUserInMultipleTeamsChange: (v) => {
          if (canEdit) void persistTeams({ allowUserInMultipleTeams: v });
        },
        genderSwitchLayoutId: 'gameFormatDetailsCardTeams',
        readOnly: !canEdit,
      }
    : undefined;

  const handleWizardDone = async () => {
    handleWizardClose();
    setIsWizardOpen(false);
    if (!canEdit) return;
    await persistFormat();
  };

  const handleOpenWizard = () => {
    if (!canEdit) return;
    notifyFormatWizardOpen();
    setIsWizardOpen(true);
  };

  const fixedTeamsPanel = <FixedTeamsManagement embedded game={game} onGameUpdate={onGameUpdate} />;

  const summaryPlayersPerMatch =
    game.entityType === 'GAME' || game.entityType === 'LEAGUE' ? playersPerMatchOf(game) : undefined;

  const genderSection =
    teamsForCard && gameFormatGenderVisible(game.entityType) ? (
      <GameFormatGenderFields
        entityType={game.entityType}
        genderTeams={teamsForCard.genderTeams}
        onGenderTeamsChange={teamsForCard.onGenderTeamsChange}
        genderSwitchLayoutId={teamsForCard.genderSwitchLayoutId}
        readOnly={teamsForCard.readOnly}
      />
    ) : undefined;

  const renderFormatCard = (embedded?: boolean) => (
    <GameFormatCard
      embedded={embedded}
      omitGender={embedded}
      entityType={game.entityType}
      format={gameFormat}
      playersPerMatch={summaryPlayersPerMatch}
      sport={game.sport}
      generationSlotCount={
        formatMaxParticipants != null && formatMaxParticipants > 0 ? formatMaxParticipants : undefined
      }
      onOpenWizard={handleOpenWizard}
      showWizardButton={canEdit}
      wizardButtonLabel={templateFlow.formatWizardCustomizeLabel}
      participantFormatEditHint={
        game.resultsByAnyone && canEdit ? t('gameFormat.resultsByAnyoneEditHint') : undefined
      }
      teams={teamsForCard}
      fixedTeamsPanel={embedded ? undefined : fixedTeamsPanel}
      fixedTeamsPanelOpen={embedded ? undefined : hasFixedTeams}
      showFixedTeamsToggle={!embedded}
      suppressAllowMultiToggle={suppressAllowMultiToggle}
    />
  );

  return (
    <div className="space-y-4">
      {showTemplatePicker ? (
        <CreateGameIntentPicker
          sport={sport}
          allowedScoringPresets={allowedScoringPresets}
          participantContext={templateParticipantContext}
          selectedTemplateId={templateFlow.activeTemplateId}
          isCustom={templateFlow.isCustom}
          showManualCard={templateFlow.showManualCard}
          onSelectTemplate={templateFlow.handleTemplateSelect}
          onSelectCustom={templateFlow.handleCustomSelect}
          isRatingGame={game.affectsRating ?? false}
          onRatingGameChange={(checked) => void handleRatingGameChange(checked)}
          scoringPreset={gameFormat.scoringPreset}
          matchTimedCapMinutes={gameFormat.matchTimedCapMinutes}
          onAmericanoPointsChange={templateFlow.handleAmericanoPointsChange}
          onTimedMinutesChange={templateFlow.handleTimedMinutesChange}
          durationContext={templateDurationContext}
          customMatchGenerationType={gameFormat.generationType}
          customGameType={gameFormat.gameType}
          customMatchTimerEnabled={gameFormat.matchTimerEnabled}
          customCustomPointsTotal={gameFormat.customPointsTotal}
          readOnly={!canEdit}
          formatSection={templateFlow.isCustom ? renderFormatCard(true) : undefined}
          genderSection={genderSection}
          onOpenFormatWizard={handleOpenWizard}
          formatWizardCustomizeLabel={templateFlow.formatWizardCustomizeLabel}
        />
      ) : templateFlow.showFormatSection ? (
        renderFormatCard()
      ) : null}

      {isWizardOpen ? (
        <GameFormatWizard
          isOpen={isWizardOpen}
          format={gameFormat}
          wizardEntityType={game.entityType}
          generationSlotCount={
            formatMaxParticipants != null && formatMaxParticipants > 0 ? formatMaxParticipants : undefined
          }
          hasFixedTeams={hasFixedTeams}
          allowByPointsInRanking={game.entityType !== 'LEAGUE_SEASON'}
          onClose={closeFormatWizard}
          onDone={handleWizardDone}
          playersPerMatch={summaryPlayersPerMatch}
          sport={game.sport}
          allowedScoringModes={allowedScoringModes}
          allowedScoringPresets={templateFlow.wizardAllowedPresets}
        />
      ) : null}
    </div>
  );
};
