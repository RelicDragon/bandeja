import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  GameFormatCard,
  GameFormatWizard,
  gameFormatTeamsFieldsVisible,
  type GameFormatTeamsBinding,
} from '@/components/gameFormat';
import { FixedTeamsManagement } from '@/components/GameDetails/FixedTeamsManagement';
import { useGameFormat } from '@/hooks/useGameFormat';
import { gamesApi } from '@/api';
import { resultsRoundGenV2Payload } from '@/utils/resultsRoundGenV2';
import { Game, GenderTeam } from '@/types';

interface GameFormatSectionProps {
  game: Game;
  canEdit: boolean;
  onGameUpdate: (game: Game) => void;
}

export const GameFormatSection = ({ game, canEdit, onGameUpdate }: GameFormatSectionProps) => {
  const { t } = useTranslation();
  const formatMaxParticipants = game.entityType === 'LEAGUE_SEASON' ? 4 : game.maxParticipants;
  const gameFormat = useGameFormat({
    ...game,
    maxParticipants: formatMaxParticipants,
  });
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  const maxParticipants = formatMaxParticipants ?? 0;
  const genderTeams = (game.genderTeams || 'ANY') as GenderTeam;
  const hasFixedTeams = maxParticipants === 2 ? false : (game.hasFixedTeams || false);

  const persistTeams = useCallback(
    async (patch: { genderTeams?: GenderTeam; hasFixedTeams?: boolean }) => {
      if (!canEdit) return;
      try {
        const body: Partial<Game> = {};
        if (patch.genderTeams !== undefined) body.genderTeams = patch.genderTeams;
        if (patch.hasFixedTeams !== undefined) {
          body.hasFixedTeams = game.maxParticipants === 2 ? false : patch.hasFixedTeams;
        }
        await gamesApi.update(game.id, body);
        const response = await gamesApi.getById(game.id);
        onGameUpdate(response.data);
      } catch (error: any) {
        const errorMessage = error.response?.data?.message || 'errors.generic';
        toast.error(t(errorMessage, { defaultValue: errorMessage }));
      }
    },
    [canEdit, game.id, game.maxParticipants, onGameUpdate, t],
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
        genderSwitchLayoutId: 'gameFormatDetailsCardTeams',
        readOnly: !canEdit,
      }
    : undefined;

  const handleDone = async () => {
    if (!canEdit) return;
    const setup = gameFormat.setupPayload;
    try {
      const winnerOfGame =
        game.entityType === 'LEAGUE_SEASON' && setup.winnerOfGame === 'BY_POINTS'
          ? gameFormat.scoringMode === 'POINTS'
            ? 'BY_SCORES_DELTA'
            : 'BY_MATCHES_WON'
          : setup.winnerOfGame;
      const rankingPointsPayload =
        game.entityType === 'LEAGUE_SEASON'
          ? {}
          : {
              pointsPerWin: setup.pointsPerWin,
              pointsPerLoose: setup.pointsPerLoose,
              pointsPerTie: setup.pointsPerTie,
            };
      await gamesApi.update(game.id, {
        ...resultsRoundGenV2Payload,
        gameType: gameFormat.gameType,
        scoringMode: gameFormat.scoringMode,
        ...rankingPointsPayload,
        fixedNumberOfSets: setup.fixedNumberOfSets,
        maxTotalPointsPerSet: setup.maxTotalPointsPerSet,
        matchTimedCapMinutes: setup.matchTimedCapMinutes,
        matchTimerEnabled: setup.matchTimerEnabled ?? false,
        maxPointsPerTeam: setup.maxPointsPerTeam,
        winnerOfGame,
        winnerOfMatch: setup.winnerOfMatch,
        matchGenerationType: setup.matchGenerationType,
        prohibitMatchesEditing: setup.prohibitMatchesEditing,
        ballsInGames: setup.ballsInGames,
        scoringPreset: setup.scoringPreset,
        hasGoldenPoint: setup.hasGoldenPoint,
      });
      const response = await gamesApi.getById(game.id);
      onGameUpdate(response.data);
      toast.success(t('gameResults.setupUpdated'));
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  };

  const handleOpenWizard = () => {
    if (!canEdit) return;
    setIsWizardOpen(true);
  };

  const fixedTeamsPanel = (
    <FixedTeamsManagement embedded game={game} onGameUpdate={onGameUpdate} />
  );

  return (
    <>
      <GameFormatCard
        entityType={game.entityType}
        format={gameFormat}
        generationSlotCount={
          formatMaxParticipants != null && formatMaxParticipants > 0 ? formatMaxParticipants : undefined
        }
        onOpenWizard={handleOpenWizard}
        showWizardButton={canEdit}
        teams={teamsForCard}
        fixedTeamsPanel={fixedTeamsPanel}
        fixedTeamsPanelOpen={hasFixedTeams}
      />
      {isWizardOpen && (
        <GameFormatWizard
          isOpen={isWizardOpen}
          format={gameFormat}
          wizardEntityType={game.entityType}
          generationSlotCount={
            formatMaxParticipants != null && formatMaxParticipants > 0 ? formatMaxParticipants : undefined
          }
          hasFixedTeams={hasFixedTeams}
          allowByPointsInRanking={game.entityType !== 'LEAGUE_SEASON'}
          onClose={() => setIsWizardOpen(false)}
          onDone={handleDone}
        />
      )}
    </>
  );
};
