import prisma from '../../../config/database';
import { t } from '../../../utils/translations';
import { formatGameInfoForUser, FormattedGameInfo } from '../notification-base';
import { getMatchScoresForDelta } from '../../results/setScoreDelta';
import { isOfficialMatchSetRole } from '../../results/matchSetRole';
import { getRules } from '../../results/liveScoringEngine/rulebook';
import { getStandingsMatchOutcome } from '../../results/liveScoringEngine/matchWinnerLive';
import { prismaMatchSetsToLiveSets } from '../../results/matchStandingsPrisma';

export interface PlayerStats {
  wins: number;
  ties: number;
  losses: number;
  scoresDelta: number;
}

export interface GameResultsContext {
  lang: string;
  gameId: string;
  title: string;
  titleKey: string;
  bodyLines: string[];
  shortDayOfWeek: string;
  gameName: string;
  clubName?: string;
  gameInfo: FormattedGameInfo;
  game: NonNullable<Awaited<ReturnType<typeof loadGameForResultsNotification>>>;
  userOutcome: NonNullable<ReturnType<typeof findUserOutcome>>;
  stats: PlayerStats;
  metadata: Record<string, unknown>;
}

function matchWinnerForStats(match: any, game: any): 'teamA' | 'teamB' | 'tie' | null {
  const rules = getRules(game);
  const o = getStandingsMatchOutcome(prismaMatchSetsToLiveSets(match.sets), rules);
  if (o === 'A') return 'teamA';
  if (o === 'B') return 'teamB';
  if (o === 'tie') return 'tie';
  return null;
}

function calculatePlayerStats(playerId: string, rounds: any[], game: any): PlayerStats {
  const stats: PlayerStats = {
    wins: 0,
    ties: 0,
    losses: 0,
    scoresDelta: 0,
  };

  for (const round of rounds) {
    if (!round.matches || round.matches.length === 0) continue;

    for (const match of round.matches) {
      const validSets = match.sets.filter(
        (set: any) =>
          (set.teamAScore > 0 || set.teamBScore > 0) && isOfficialMatchSetRole(set.role),
      );
      if (validSets.length === 0) continue;

      const teamA = match.teams.find((t: any) => t.teamNumber === 1);
      const teamB = match.teams.find((t: any) => t.teamNumber === 2);
      if (!teamA || !teamB) continue;

      const isInTeamA = teamA.players.some((p: any) => p.userId === playerId);
      const isInTeamB = teamB.players.some((p: any) => p.userId === playerId);
      if (!isInTeamA && !isInTeamB) continue;

      const matchWinner = matchWinnerForStats(match, game);
      if (matchWinner === null) continue;

      const { teamAScore: totalScoreA, teamBScore: totalScoreB } = getMatchScoresForDelta(
        validSets.map((set: any) => ({
          teamAScore: set.teamAScore,
          teamBScore: set.teamBScore,
          isTieBreak: set.isTieBreak,
        })),
      );

      if (isInTeamA) {
        stats.scoresDelta += totalScoreA - totalScoreB;
        if (matchWinner === 'teamA') stats.wins++;
        else if (matchWinner === 'teamB') stats.losses++;
        else if (matchWinner === 'tie') stats.ties++;
      } else if (isInTeamB) {
        stats.scoresDelta += totalScoreB - totalScoreA;
        if (matchWinner === 'teamB') stats.wins++;
        else if (matchWinner === 'teamA') stats.losses++;
        else if (matchWinner === 'tie') stats.ties++;
      }
    }
  }

  return stats;
}

async function loadGameForResultsNotification(gameId: string) {
  return prisma.game.findUnique({
    where: { id: gameId },
    include: {
      court: { include: { club: true } },
      club: true,
      participants: {
        where: { status: 'PLAYING' },
        include: {
          user: {
            select: {
              id: true,
              telegramId: true,
              language: true,
              firstName: true,
              lastName: true,
              currentCityId: true,
              primarySport: true,
            },
          },
        },
      },
      outcomes: {
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { position: 'asc' },
      },
      rounds: {
        include: {
          matches: {
            include: {
              teams: { include: { players: true } },
              sets: { orderBy: { setNumber: 'asc' } },
            },
          },
        },
        orderBy: { roundNumber: 'asc' },
      },
    },
  });
}

function findUserOutcome(game: NonNullable<Awaited<ReturnType<typeof loadGameForResultsNotification>>>, userId: string) {
  return game.outcomes.find((o) => o.userId === userId) ?? null;
}

export async function buildGameResultsContext(
  gameId: string,
  userId: string,
  isEdited: boolean = false,
): Promise<GameResultsContext | null> {
  const game = await loadGameForResultsNotification(gameId);
  if (!game || !game.outcomes || game.outcomes.length === 0) {
    return null;
  }

  const userOutcome = findUserOutcome(game, userId);
  if (!userOutcome) {
    return null;
  }

  const participant = game.participants.find((p) => p.userId === userId);
  if (!participant) {
    return null;
  }

  const lang = participant.user.language || 'en';
  const gameInfo = await formatGameInfoForUser(game, participant.user.currentCityId, lang);
  const gameName = game.name ? game.name : t(`games.gameTypes.${game.gameType}`, lang);
  const clubName = game.court?.club?.name || game.club?.name;

  const titleKey = isEdited ? 'telegram.gameResultsChanged' : 'telegram.gameFinished';
  const title = t(titleKey, lang);

  const bodyLines: string[] = [];
  const firstLine = clubName ? `${gameName} - ${clubName}` : gameName;
  bodyLines.push(firstLine);
  bodyLines.push(`${gameInfo.shortDayOfWeek} ${gameInfo.shortDate} ${gameInfo.startTime}`);

  const levelChangeStr = userOutcome.levelChange > 0
    ? `+${userOutcome.levelChange.toFixed(2)}`
    : userOutcome.levelChange.toFixed(2);
  const levelPart = `${t('telegram.level', lang)}: ${levelChangeStr}`;

  if (userOutcome.position) {
    bodyLines.push(`${t('telegram.finalPlace', lang)}: ${userOutcome.position} | ${levelPart}`);
  } else {
    bodyLines.push(` | ${levelPart}`);
  }

  const stats = calculatePlayerStats(userId, game.rounds, game);
  const metadata = (userOutcome.metadata as Record<string, unknown>) || {};

  return {
    lang,
    gameId: game.id,
    title,
    titleKey,
    bodyLines,
    shortDayOfWeek: gameInfo.shortDayOfWeek,
    gameName,
    clubName,
    gameInfo,
    game,
    userOutcome,
    stats,
    metadata,
  };
}
