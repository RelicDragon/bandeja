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
  const gameFormat = useGameFormat(game);
  const [isWizardOpen, setIsWizardOpen] = useState(false);

  const maxParticipants = game.maxParticipants ?? 0;
  const genderTeams = (game.genderTeams || 'ANY') as GenderTeam;
  const hasFixedTeams = game.maxParticipants === 2 ? false : (game.hasFixedTeams || false);

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
      await gamesApi.update(game.id, {
        ...resultsRoundGenV2Payload,
        gameType: gameFormat.gameType,
        scoringMode: gameFormat.scoringMode,
        pointsPerWin: setup.pointsPerWin,
        pointsPerLoose: setup.pointsPerLoose,
        pointsPerTie: setup.pointsPerTie,
        fixedNumberOfSets: setup.fixedNumberOfSets,
        maxTotalPointsPerSet: setup.maxTotalPointsPerSet,
        matchTimedCapMinutes: setup.matchTimedCapMinutes,
        maxPointsPerTeam: setup.maxPointsPerTeam,
        winnerOfGame: setup.winnerOfGame,
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
          game.maxParticipants != null && game.maxParticipants > 0 ? game.maxParticipants : undefined
        }
        onOpenWizard={handleOpenWizard}
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
            game.maxParticipants != null && game.maxParticipants > 0 ? game.maxParticipants : undefined
          }
          hasFixedTeams={hasFixedTeams}
          onClose={() => setIsWizardOpen(false)}
          onDone={handleDone}
        />
      )}
    </>
  );
};
