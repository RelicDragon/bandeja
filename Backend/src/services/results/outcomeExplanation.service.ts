import prisma from '../../config/database';
import { calculateRatingUpdate, RELIABILITY_INCREMENT } from './rating.service';
import { LevelChangeEventType, EntityType, ParticipantRole } from '@prisma/client';
import {
  SOCIAL_PARTICIPANT_LEVEL,
  ROLE_MULTIPLIERS,
} from '../socialLevelConstants';
import { USER_SELECT_FIELDS } from '../../utils/constants';

interface ExplanationData {
  userId: string;
  userLevel: number;
  userReliability: number;
  userGamesPlayed: number;
  levelChange: number;
  reliabilityChange: number;
  reliabilityCoefficient: number;
  matches: MatchExplanation[];
  summary: {
    totalMatches: number;
    wins: number;
    losses: number;
    draws: number;
    averageOpponentLevel: number;
  };
  socialLevelChange?: {
    levelBefore: number;
    levelAfter: number;
    levelChange: number;
    baseBoost: number;
    roleMultiplier: number;
    roleName: string;
    participantBreakdown: Array<{
      participantId: string;
      participantName: string;
      gamesPlayedTogether: number;
      boost: number;
    }>;
  };
}

interface SetExplanation {
  setNumber: number;
  isWinner: boolean;
  levelChange: number;
  userScore: number;
  opponentScore: number;
  isTieBreak?: boolean;
}

interface MatchExplanation {
  matchNumber: number;
  roundNumber: number;
  isWinner: boolean;
  isDraw: boolean;
  opponentLevel: number;
  levelDifference: number;
  scoreDelta?: number;
  levelChange: number;
  pointsEarned: number;
  multiplier?: number;
  totalPointDifferential?: number;
  enduranceCoefficient?: number;
  teammates: Array<{ firstName: string | null; lastName: string | null; level: number }>;
  opponents: Array<{ firstName: string | null; lastName: string | null; level: number }>;
  sets?: SetExplanation[];
}

export async function getOutcomeExplanation(
  gameId: string,
  userId: string
): Promise<ExplanationData | null> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      rounds: {
        orderBy: { roundNumber: 'asc' },
        include: {
          matches: {
            include: {
              teams: {
                include: {
                  players: {
                    include: {
                      user: {
                        select: {
                          ...USER_SELECT_FIELDS,
                          reliability: true,
                          gamesPlayed: true,
                        },
                      },
                    },
                  },
                },
              },
              sets: true,
            },
          },
        },
      },
      participants: {
        include: {
          user: {
            select: {
              ...USER_SELECT_FIELDS,
              reliability: true,
              gamesPlayed: true,
            },
          },
        },
      },
      outcomes: {
        select: {
          userId: true,
          levelBefore: true,
        },
      },
    },
  });

  if (!game) return null;

  const participant = game.participants.find(p => p.userId === userId);
  if (!participant) return null;

  const ballsInGames = game.ballsInGames || false;

  const existingOutcome = await prisma.gameOutcome.findUnique({
    where: {
      gameId_userId: {
        gameId,
        userId,
      },
    },
    select: {
      levelBefore: true,
      levelAfter: true,
      levelChange: true,
      reliabilityBefore: true,
      reliabilityAfter: true,
      reliabilityChange: true,
    },
  });

  // Create a map of userId to levelBefore for all players
  const playerLevelsMap = new Map<string, number>();
  if (game.outcomes && game.outcomes.length > 0) {
    // Use levelBefore from outcomes if they exist
    for (const outcome of game.outcomes) {
      playerLevelsMap.set(outcome.userId, outcome.levelBefore);
    }
  } else {
    // Fallback to current levels if no outcomes exist yet
    for (const p of game.participants) {
      playerLevelsMap.set(p.userId, p.user.level);
    }
  }

  const user = participant.user;
  let currentLevel = existingOutcome?.levelBefore ?? user.level;
  const startingReliability = existingOutcome?.reliabilityBefore ?? user.reliability;

  const matches: MatchExplanation[] = [];
  let totalLevelChange = 0;
  let matchesPlayed = 0;
  let wins = 0;
  let losses = 0;
  let draws = 0;
  let opponentLevels: number[] = [];

  let matchNumber = 0;

  for (const round of game.rounds) {
    for (const match of round.matches) {
      const validSets = match.sets.filter(set => set.teamAScore > 0 || set.teamBScore > 0);
      if (validSets.length === 0) continue;

      const userTeam = match.teams.find(t => t.players.some(p => p.userId === userId));
      if (!userTeam) continue;

      matchNumber++;

      const opponentTeam = match.teams.find(t => t.id !== userTeam.id);
      if (!opponentTeam) continue;

      const teammates = userTeam.players
        .filter(p => p.userId !== userId)
        .map(p => ({
          firstName: p.user.firstName,
          lastName: p.user.lastName,
          level: playerLevelsMap.get(p.userId) ?? p.user.level,
        }));

      const opponents = opponentTeam.players.map(p => ({
        firstName: p.user.firstName,
        lastName: p.user.lastName,
        level: playerLevelsMap.get(p.userId) ?? p.user.level,
      }));

      const opponentLevel =
        opponentTeam.players.reduce((sum: number, p) => sum + (playerLevelsMap.get(p.userId) ?? p.user.level), 0) / opponentTeam.players.length;

      const userTeamLevel =
        userTeam.players.reduce((sum: number, p) => sum + (playerLevelsMap.get(p.userId) ?? p.user.level), 0) / userTeam.players.length;

      opponentLevels.push(opponentLevel);

      const levelDifference = opponentLevel - userTeamLevel;

      const isTie = match.winnerId === null;
      const isWinner = match.winnerId === userTeam.id;

      const setScores = validSets.map(set => {
        if (userTeam.teamNumber === 1) {
          return { teamAScore: set.teamAScore, teamBScore: set.teamBScore, isTieBreak: set.isTieBreak || false };
        } else {
          return { teamAScore: set.teamBScore, teamBScore: set.teamAScore, isTieBreak: set.isTieBreak || false };
        }
      });

      let matchLevelChange = 0;
      let matchPointsEarned = 0;
      let matchMultiplier: number | undefined = undefined;
      let matchTotalPointDifferential: number | undefined = undefined;
      let matchEnduranceCoefficient: number | undefined = undefined;
      const setExplanations: SetExplanation[] = [];

      const update = calculateRatingUpdate(
        {
          level: currentLevel,
          reliability: startingReliability,
          gamesPlayed: user.gamesPlayed,
        },
        {
          isWinner,
          isDraw: isTie,
          opponentsLevel: opponentLevel,
          setScores,
        },
        ballsInGames
      );

      const rawMatchLevelChange = update.levelChange;
      matchPointsEarned = update.pointsEarned;
      matchMultiplier = update.multiplier;
      matchTotalPointDifferential = update.totalPointDifferential;
      matchEnduranceCoefficient = update.enduranceCoefficient;

      let setNumber = 0;
      for (const set of validSets) {
        setNumber++;
        const setAWins = set.teamAScore > set.teamBScore;
        const setBWins = set.teamBScore > set.teamAScore;
        const setIsWinner = userTeam.teamNumber === 1 ? setAWins : setBWins;

        setExplanations.push({
          setNumber,
          isWinner: setIsWinner,
          levelChange: 0,
          userScore: userTeam.teamNumber === 1 ? set.teamAScore : set.teamBScore,
          opponentScore: userTeam.teamNumber === 1 ? set.teamBScore : set.teamAScore,
          isTieBreak: set.isTieBreak || false,
        });
      }

      matchLevelChange = rawMatchLevelChange;
      currentLevel = currentLevel + rawMatchLevelChange;
      matchesPlayed += 1;

      totalLevelChange += rawMatchLevelChange;

      if (isTie) draws++;
      else if (isWinner) wins++;
      else losses++;

      matches.push({
        matchNumber,
        roundNumber: round.roundNumber,
        isWinner,
        isDraw: isTie,
        opponentLevel,
        levelDifference,
        levelChange: matchLevelChange,
        pointsEarned: matchPointsEarned,
        multiplier: matchMultiplier,
        totalPointDifferential: matchTotalPointDifferential,
        enduranceCoefficient: matchEnduranceCoefficient,
        teammates,
        opponents,
        sets: setExplanations.length > 0 ? setExplanations : undefined,
      });
    }
  }

  const averageOpponentLevel =
    opponentLevels.length > 0 ? opponentLevels.reduce((sum: number, l: number) => sum + l, 0) / opponentLevels.length : 0;

  const startingLevel = existingOutcome?.levelBefore ?? user.level;
  const totalReliabilityChange = existingOutcome?.reliabilityChange ?? (matchesPlayed * RELIABILITY_INCREMENT);
  
  const clampedReliability = Math.max(0.0, Math.min(100.0, startingReliability));
  const reliabilityCoefficient = Math.max(0.05, Math.exp(-0.15 * Math.pow(clampedReliability, 0.68)));

  const finalLevel = Math.max(1.0, Math.min(7.0, startingLevel + totalLevelChange));
  const clampedLevelChange = finalLevel - startingLevel;

  // Get social level change data if it exists
  let socialLevelChangeData = undefined;
  if (game.entityType !== EntityType.BAR && game.entityType !== EntityType.LEAGUE_SEASON) {
    const socialLevelEvent = await prisma.levelChangeEvent.findFirst({
      where: {
        gameId: gameId,
        userId: userId,
        eventType: LevelChangeEventType.SOCIAL_PARTICIPANT,
      },
    });

    if (socialLevelEvent) {
      const currentParticipant = game.participants.find(p => p.userId === userId);
      if (currentParticipant) {
        const playingParticipants = game.participants.filter(p => p.isPlaying);
        const allParticipants = game.participants;
        
        const parentGameParticipants = game.parentId
          ? await prisma.gameParticipant.findMany({
              where: {
                gameId: game.parentId,
                userId: { in: allParticipants.map(p => p.userId) },
              },
              select: {
                userId: true,
                role: true,
              },
            })
          : [];

        const parentParticipantMap = new Map(
          parentGameParticipants.map(p => [p.userId, p.role])
        );

        let baseBoost = 0.0;
        const participantBreakdown: Array<{
          participantId: string;
          participantName: string;
          gamesPlayedTogether: number;
          boost: number;
        }> = [];

        for (const otherParticipant of playingParticipants) {
          if (otherParticipant.userId === userId) {
            continue;
          }

          const numberOfPlayedGames = await countCoPlayedGames(
            userId,
            otherParticipant.userId,
            gameId,
            game.startTime
          );

          const boost =
            SOCIAL_PARTICIPANT_LEVEL.MAX_BOOST_PER_RELATIONSHIP -
            Math.min(
              SOCIAL_PARTICIPANT_LEVEL.MAX_GAMES_FOR_REDUCTION,
              numberOfPlayedGames
            ) *
              SOCIAL_PARTICIPANT_LEVEL.REDUCTION_PER_GAME;
          
          baseBoost += boost;

          const otherUser = otherParticipant.user;
          participantBreakdown.push({
            participantId: otherParticipant.userId,
            participantName: `${otherUser.firstName || ''} ${otherUser.lastName || ''}`.trim() || 'Unknown',
            gamesPlayedTogether: numberOfPlayedGames,
            boost: boost,
          });
        }

        const multiplier = getRoleMultiplier(
          currentParticipant.role,
          parentParticipantMap.get(userId),
          currentParticipant.isPlaying
        );

        const roleName = getRoleName(
          currentParticipant.role,
          parentParticipantMap.get(userId),
          currentParticipant.isPlaying
        );

        socialLevelChangeData = {
          levelBefore: socialLevelEvent.levelBefore,
          levelAfter: socialLevelEvent.levelAfter,
          levelChange: socialLevelEvent.levelAfter - socialLevelEvent.levelBefore,
          baseBoost,
          roleMultiplier: multiplier,
          roleName,
          participantBreakdown,
        };
      }
    }
  }

  return {
    userId,
    userLevel: startingLevel,
    userReliability: startingReliability,
    userGamesPlayed: user.gamesPlayed,
    levelChange: clampedLevelChange,
    reliabilityChange: totalReliabilityChange,
    reliabilityCoefficient,
    matches,
    summary: {
      totalMatches: matches.length,
      wins,
      losses,
      draws,
      averageOpponentLevel,
    },
    socialLevelChange: socialLevelChangeData,
  };
}

async function countCoPlayedGames(
  userId1: string,
  userId2: string,
  currentGameId: string,
  currentGameStartTime: Date
): Promise<number> {
  const games = await prisma.game.findMany({
    where: {
      id: { not: currentGameId },
      startTime: { lt: currentGameStartTime },
      entityType: { notIn: [EntityType.BAR, EntityType.LEAGUE_SEASON] },
      AND: [
        { participants: { some: { userId: userId1, isPlaying: true } } },
        { participants: { some: { userId: userId2, isPlaying: true } } },
      ],
    },
    select: { id: true },
  });

  return games.length;
}

function getRoleMultiplier(
  currentRole: ParticipantRole,
  parentRole: ParticipantRole | undefined,
  isPlaying: boolean
): number {
  if (currentRole === ParticipantRole.OWNER) {
    return isPlaying
      ? ROLE_MULTIPLIERS.OWNER.PLAYED
      : ROLE_MULTIPLIERS.OWNER.NOT_PLAYED;
  }

  if (parentRole === ParticipantRole.OWNER) {
    return isPlaying
      ? ROLE_MULTIPLIERS.PARENT_OWNER.PLAYED
      : ROLE_MULTIPLIERS.PARENT_OWNER.NOT_PLAYED;
  }

  if (currentRole === ParticipantRole.ADMIN) {
    return isPlaying
      ? ROLE_MULTIPLIERS.ADMIN.PLAYED
      : ROLE_MULTIPLIERS.ADMIN.NOT_PLAYED;
  }

  if (parentRole === ParticipantRole.ADMIN) {
    return isPlaying
      ? ROLE_MULTIPLIERS.PARENT_ADMIN.PLAYED
      : ROLE_MULTIPLIERS.PARENT_ADMIN.NOT_PLAYED;
  }

  return isPlaying
    ? ROLE_MULTIPLIERS.PARTICIPANT.PLAYED
    : ROLE_MULTIPLIERS.PARTICIPANT.NOT_PLAYED;
}

function getRoleName(
  currentRole: ParticipantRole,
  parentRole: ParticipantRole | undefined,
  isPlaying: boolean
): string {
  if (currentRole === ParticipantRole.OWNER) {
    return isPlaying ? 'Owner (Played)' : 'Owner (Not Played)';
  }

  if (parentRole === ParticipantRole.OWNER) {
    return isPlaying ? 'Parent Owner (Played)' : 'Parent Owner (Not Played)';
  }

  if (currentRole === ParticipantRole.ADMIN) {
    return isPlaying ? 'Admin (Played)' : 'Admin (Not Played)';
  }

  if (parentRole === ParticipantRole.ADMIN) {
    return isPlaying ? 'Parent Admin (Played)' : 'Parent Admin (Not Played)';
  }

  return isPlaying ? 'Participant' : 'Participant (Not Played)';
}
