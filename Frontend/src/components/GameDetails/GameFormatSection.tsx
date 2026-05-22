import { useCallback, useMemo, useState } from 'react';
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
import { useClampGameFormatToSport } from '@/hooks/useSportGameFormatLimits';
import { resolvePlayersPerMatchForGame } from '@/utils/matchFormat';
import { Game, GenderTeam } from '@/types';
import type { GameFormatWizardMatchFormat } from '@/components/gameFormat/GameFormatWizard';

interface GameFormatSectionProps {
  game: Game;
  canEdit: boolean;
  onGameUpdate: (game: Game) => void;
  /** Hide allow-multi on format card while Settings edit mode uses the draft (single control). */
  suppressAllowMultiToggle?: boolean;
}

export const GameFormatSection = ({ game, canEdit, onGameUpdate, suppressAllowMultiToggle }: GameFormatSectionProps) => {
  const { t } = useTranslation();
  const formatMaxParticipants = game.entityType === 'LEAGUE_SEASON' ? 4 : game.maxParticipants;
  const gameFormat = useGameFormat({
    ...game,
    maxParticipants: formatMaxParticipants,
  });
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const sportFormatLimits = useClampGameFormatToSport(game.sport, gameFormat, canEdit);
  const [wizardPlayersPerMatch, setWizardPlayersPerMatch] = useState<number>(() =>
    resolvePlayersPerMatchForGame(game),
  );

  const maxParticipants = formatMaxParticipants ?? 0;
  const genderTeams = (game.genderTeams || 'ANY') as GenderTeam;
  const hasFixedTeams = maxParticipants === 2 ? false : (game.hasFixedTeams || false);

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
      } catch (error: any) {
        const errorMessage = error.response?.data?.message || 'errors.generic';
        toast.error(t(errorMessage, { defaultValue: errorMessage }));
      }
    },
    [canEdit, game.id, game.maxParticipants, game.hasFixedTeams, onGameUpdate, t],
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
      const matchFormatPatch =
        game.entityType === 'GAME' || game.entityType === 'LEAGUE'
          ? {
              playersPerMatch: wizardPlayersPerMatch,
              ...(wizardPlayersPerMatch === 2
                ? { hasFixedTeams: false, allowUserInMultipleTeams: false }
                : {}),
            }
          : {};
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
        ballsInGames: setup.ballsInGames,
        scoringPreset: setup.scoringPreset,
        hasGoldenPoint: setup.hasGoldenPoint,
        ...matchFormatPatch,
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
    setWizardPlayersPerMatch(resolvePlayersPerMatchForGame(game));
    setIsWizardOpen(true);
  };

  const wizardMatchFormat = useMemo((): GameFormatWizardMatchFormat | undefined => {
    if (game.entityType !== 'GAME' && game.entityType !== 'LEAGUE') return undefined;
    if (sportFormatLimits.sportConfig.allowedPlayerCountsPerMatch.length <= 1) return undefined;
    return {
      playersPerMatch: wizardPlayersPerMatch,
      allowedCounts: sportFormatLimits.sportConfig.allowedPlayerCountsPerMatch,
      disabled: maxParticipants === 2,
      sport: game.sport,
      onChange: setWizardPlayersPerMatch,
    };
  }, [
    game.entityType,
    game.sport,
    sportFormatLimits.sportConfig.allowedPlayerCountsPerMatch,
    wizardPlayersPerMatch,
    maxParticipants,
  ]);

  const fixedTeamsPanel = (
    <FixedTeamsManagement embedded game={game} onGameUpdate={onGameUpdate} />
  );

  const summaryPlayersPerMatch =
    game.entityType === 'GAME' || game.entityType === 'LEAGUE'
      ? resolvePlayersPerMatchForGame(game)
      : undefined;

  return (
    <>
      <GameFormatCard
        entityType={game.entityType}
        format={gameFormat}
        playersPerMatch={summaryPlayersPerMatch}
        sport={game.sport}
        generationSlotCount={
          formatMaxParticipants != null && formatMaxParticipants > 0 ? formatMaxParticipants : undefined
        }
        onOpenWizard={handleOpenWizard}
        showWizardButton={canEdit}
        teams={teamsForCard}
        fixedTeamsPanel={fixedTeamsPanel}
        fixedTeamsPanelOpen={hasFixedTeams}
        suppressAllowMultiToggle={suppressAllowMultiToggle}
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
          matchFormat={wizardMatchFormat}
          allowedScoringModes={sportFormatLimits.allowedScoringModes}
          allowedScoringPresets={sportFormatLimits.allowedScoringPresets}
        />
      )}
    </>
  );
};
