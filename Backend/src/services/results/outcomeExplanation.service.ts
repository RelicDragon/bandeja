import prisma from '../../config/database';
import { getSportConfig } from '../../sport/sportRegistry';
import { calculateRatingUpdate, calculateReliabilityChange } from './rating.service';
import {
  LevelChangeEventType,
  EntityType,
  ParticipantRole,
  Sport,
  WinnerOfGame,
  Prisma,
} from '@prisma/client';
import {
  SOCIAL_PARTICIPANT_LEVEL,
  ROLE_MULTIPLIERS,
} from '../socialLevelConstants';
import { USER_SELECT_FIELDS, USER_SPORT_PROFILE_SELECT } from '../../utils/constants';
import { resolveUserSportSnapshot } from '../user/userSportProfile.service';
import { isPlacementProtectedFromNegativeRating } from './ratingPlacementFloor';
import { isOfficialMatchSetRole } from './matchSetRole';
import { getRules } from './liveScoringEngine/rulebook';
import { getStandingsMatchOutcome } from './liveScoringEngine/matchWinnerLive';
import {
  GameRulesSource,
  isPrismaMatchCountedForStandingsAndRating,
  prismaMatchSetsToLiveSets,
} from './matchStandingsPrisma';

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
  placementRatingFloor?: {
    applied: boolean;
    uncappedLevelChange: number;
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
  notFinishedByRules?: boolean;
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

export interface StoredOutcomeForExplanation {
  levelBefore: number;
  levelAfter: number;
  levelChange: number;
  reliabilityBefore: number;
  reliabilityAfter: number;
  reliabilityChange: number;
  position: number | null;
  wins: number;
  ties: number;
  losses: number;
  metadata: Prisma.JsonValue | null;
}

interface PlayerRatingState {
  baseLevel: number;
  reliability: number;
  levelChange: number;
  wins: number;
  ties: number;
  losses: number;
  allSets: Array<{ teamAScore: number; teamBScore: number; isTieBreak?: boolean }>;
}

type ExplanationUser = {
  firstName: string | null;
  lastName: string | null;
  reliability?: number;
  gamesPlayed?: number;
  sportProfiles?: Array<{
    sport: Sport;
    level: number;
    reliability: number;
    gamesPlayed: number;
    gamesWon: number;
  }>;
};

type ExplanationMatchSet = {
  teamAScore: number;
  teamBScore: number;
  isTieBreak?: boolean | null;
  role: Parameters<typeof isOfficialMatchSetRole>[0];
};

type ExplanationMatch = {
  id: string;
  winnerId: string | null;
  teams: Array<{
    id: string;
    teamNumber: number;
    players: Array<{
      userId: string;
      user: ExplanationUser;
    }>;
  }>;
  sets: ExplanationMatchSet[];
};

export type GameSnapshotForExplanation = GameRulesSource & {
  sport: Sport;
  entityType: EntityType;
  affectsRating: boolean;
  winnerOfGame: WinnerOfGame;
  participants: Array<{
    userId: string;
    user: ExplanationUser;
  }>;
  outcomes: Array<{ userId: string; levelBefore: number; reliabilityBefore?: number }>;
  rounds: Array<{
    roundNumber: number;
    matches: ExplanationMatch[];
  }>;
};

const userSelectForExplanation = {
  ...USER_SELECT_FIELDS,
  sportProfiles: { select: USER_SPORT_PROFILE_SELECT },
} as const;

function teamAverageLevelAtMatchStart(
  playerIds: string[],
  states: Map<string, PlayerRatingState>,
): number {
  if (playerIds.length === 0) return 0;
  let sum = 0;
  for (const id of playerIds) {
    const state = states.get(id);
    sum += (state?.baseLevel ?? 1) + (state?.levelChange ?? 0);
  }
  return sum / playerIds.length;
}

function effectiveLevel(userId: string, states: Map<string, PlayerRatingState>): number {
  const state = states.get(userId);
  if (!state) return 1;
  return state.baseLevel + state.levelChange;
}

function ensurePlayerState(
  userId: string,
  user: ExplanationUser,
  sport: Sport,
  baseLevels: Map<string, number>,
  reliabilityByUser: Map<string, number>,
  states: Map<string, PlayerRatingState>,
): PlayerRatingState {
  const existing = states.get(userId);
  if (existing) return existing;

  const snapshot = resolveUserSportSnapshot(user, sport);
  const state: PlayerRatingState = {
    baseLevel: baseLevels.get(userId) ?? snapshot.level,
    reliability: reliabilityByUser.get(userId) ?? snapshot.reliability,
    levelChange: 0,
    wins: 0,
    ties: 0,
    losses: 0,
    allSets: [],
  };
  states.set(userId, state);
  return state;
}

function updateWinLossTie(
  state: PlayerRatingState,
  isWin: boolean,
  isLoss: boolean,
  isTie: boolean,
): void {
  if (isWin) state.wins += 1;
  else if (isLoss) state.losses += 1;
  else if (isTie) state.ties += 1;
}

function readPlacementFloorMetadata(
  metadata: Prisma.JsonValue | null | undefined,
): { uncappedLevelChange: number } | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  const floor = (metadata as Record<string, unknown>).placementRatingFloor;
  if (!floor || typeof floor !== 'object' || Array.isArray(floor)) return undefined;
  const uncapped = (floor as Record<string, unknown>).uncappedLevelChange;
  if (typeof uncapped !== 'number') return undefined;
  return { uncappedLevelChange: uncapped };
}

function trackReliabilitySetsForGame(winnerOfGame: WinnerOfGame): boolean {
  return winnerOfGame !== WinnerOfGame.BY_POINTS;
}

export function buildOutcomeRatingExplanation(
  game: GameSnapshotForExplanation,
  userId: string,
  existingOutcome: StoredOutcomeForExplanation | null,
): Omit<ExplanationData, 'socialLevelChange'> {
  const participant = game.participants.find((p) => p.userId === userId);
  if (!participant) {
    throw new Error('Participant not found');
  }

  const ballsInGames = game.ballsInGames || false;
  const ratingEngine = getSportConfig(game.sport).ratingModel.engine;
  const ratingBallsInGames = ballsInGames && (ratingEngine.ballsInGamesMargin ?? false);
  const trackReliabilitySets = trackReliabilitySetsForGame(game.winnerOfGame);

  const baseLevels = new Map<string, number>();
  const reliabilityByUser = new Map<string, number>();
  if (game.outcomes.length > 0) {
    for (const outcome of game.outcomes) {
      baseLevels.set(outcome.userId, outcome.levelBefore);
      if (outcome.reliabilityBefore !== undefined) {
        reliabilityByUser.set(outcome.userId, outcome.reliabilityBefore);
      }
    }
  } else {
    for (const p of game.participants) {
      const snapshot = resolveUserSportSnapshot(p.user, game.sport);
      baseLevels.set(p.userId, snapshot.level);
      reliabilityByUser.set(p.userId, snapshot.reliability);
    }
  }

  const userSport = resolveUserSportSnapshot(participant.user, game.sport);
  const startingLevel = existingOutcome?.levelBefore ?? userSport.level;
  const startingReliability = existingOutcome?.reliabilityBefore ?? userSport.reliability;

  const states = new Map<string, PlayerRatingState>();
  for (const p of game.participants) {
    ensurePlayerState(p.userId, p.user, game.sport, baseLevels, reliabilityByUser, states);
  }

  const matches: MatchExplanation[] = [];
  let opponentLevels: number[] = [];
  let userMatchNumber = 0;

  for (const round of game.rounds) {
    for (const match of round.matches) {
      const validSets = match.sets.filter(
        (set) => (set.teamAScore > 0 || set.teamBScore > 0) && isOfficialMatchSetRole(set.role),
      );
      if (validSets.length === 0) continue;

      const userTeam = match.teams.find((t) => t.players.some((p) => p.userId === userId));
      const userInMatch = Boolean(userTeam);
      if (userInMatch) userMatchNumber += 1;

      const opponentTeam = userTeam
        ? match.teams.find((t) => t.id !== userTeam.id)
        : undefined;

      const standingOutcome = getStandingsMatchOutcome(
        prismaMatchSetsToLiveSets(match.sets),
        getRules(game),
      );
      const notFinishedByRules = standingOutcome === null;
      const countedForRating = isPrismaMatchCountedForStandingsAndRating(match, game);

      const setExplanations: SetExplanation[] = [];
      if (userTeam) {
        let setNumber = 0;
        for (const set of validSets) {
          setNumber += 1;
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
      }

      if (userInMatch && notFinishedByRules) {
        const userTeamLevel = userTeam
          ? teamAverageLevelAtMatchStart(
              userTeam.players.map((p) => p.userId),
              states,
            )
          : 0;
        const opponentLevel = opponentTeam
          ? teamAverageLevelAtMatchStart(
              opponentTeam.players.map((p) => p.userId),
              states,
            )
          : 0;

        matches.push({
          matchNumber: userMatchNumber,
          roundNumber: round.roundNumber,
          isWinner: false,
          isDraw: false,
          notFinishedByRules: true,
          opponentLevel,
          levelDifference: opponentLevel - userTeamLevel,
          levelChange: 0,
          pointsEarned: 0,
          teammates: (userTeam?.players ?? [])
            .filter((p) => p.userId !== userId)
            .map((p) => ({
              firstName: p.user.firstName,
              lastName: p.user.lastName,
              level: effectiveLevel(p.userId, states),
            })),
          opponents: (opponentTeam?.players ?? []).map((p) => ({
            firstName: p.user.firstName,
            lastName: p.user.lastName,
            level: effectiveLevel(p.userId, states),
          })),
          sets: setExplanations.length > 0 ? setExplanations : undefined,
        });
      }

      if (!countedForRating || match.teams.length !== 2) continue;

      const teamA = match.teams.find((t) => t.teamNumber === 1) || match.teams[0];
      const teamB = match.teams.find((t) => t.teamNumber === 2) || match.teams[1];
      const teamAWins = match.winnerId === teamA.id;
      const teamBWins = match.winnerId === teamB.id;
      const isTie = !teamAWins && !teamBWins;

      for (const p of [...teamA.players, ...teamB.players]) {
        ensurePlayerState(p.userId, p.user, game.sport, baseLevels, reliabilityByUser, states);
      }

      const teamAOwnAvg = teamAverageLevelAtMatchStart(
        teamA.players.map((p) => p.userId),
        states,
      );
      const teamBOwnAvg = teamAverageLevelAtMatchStart(
        teamB.players.map((p) => p.userId),
        states,
      );

      const userMatchSnapshot = userInMatch
        ? {
            opponentLevel: opponentTeam
              ? teamAverageLevelAtMatchStart(
                  opponentTeam.players.map((p) => p.userId),
                  states,
                )
              : 0,
            userTeamLevel: userTeam
              ? teamAverageLevelAtMatchStart(
                  userTeam.players.map((p) => p.userId),
                  states,
                )
              : 0,
            isWinner: userTeam?.id === teamA.id ? teamAWins : teamBWins,
            isTie,
            setScores:
              userTeam?.teamNumber === 1
                ? validSets.map((set) => ({
                    teamAScore: set.teamAScore,
                    teamBScore: set.teamBScore,
                    isTieBreak: set.isTieBreak || false,
                  }))
                : validSets.map((set) => ({
                    teamAScore: set.teamBScore,
                    teamBScore: set.teamAScore,
                    isTieBreak: set.isTieBreak || false,
                  })),
          }
        : null;

      if (userMatchSnapshot) {
        opponentLevels.push(userMatchSnapshot.opponentLevel);
      }

      const applyTeamRating = (
        teamPlayers: ExplanationMatch['teams'][0]['players'],
        teamOwnAvg: number,
        opponentsAvg: number,
        isWinner: boolean,
        isLoss: boolean,
        setScores: Array<{ teamAScore: number; teamBScore: number; isTieBreak?: boolean }>,
      ) => {
        for (const p of teamPlayers) {
          const state = states.get(p.userId)!;
          const playerLevel = state.baseLevel + state.levelChange;
          const update = calculateRatingUpdate(
            {
              level: playerLevel,
              reliability: state.reliability,
              gamesPlayed: resolveUserSportSnapshot(p.user, game.sport).gamesPlayed,
            },
            {
              isWinner,
              isDraw: isTie,
              ownTeamLevel: teamOwnAvg,
              opponentsLevel: opponentsAvg,
              setScores,
            },
            ratingBallsInGames,
            ratingEngine,
          );

          if (p.userId === userId && userMatchSnapshot) {
            matches.push({
              matchNumber: userMatchNumber,
              roundNumber: round.roundNumber,
              isWinner: userMatchSnapshot.isWinner,
              isDraw: userMatchSnapshot.isTie,
              opponentLevel: userMatchSnapshot.opponentLevel,
              levelDifference: userMatchSnapshot.opponentLevel - userMatchSnapshot.userTeamLevel,
              levelChange: update.levelChange,
              pointsEarned: update.pointsEarned,
              multiplier: update.multiplier,
              totalPointDifferential: update.totalPointDifferential,
              enduranceCoefficient: update.enduranceCoefficient,
              teammates: (userTeam?.players ?? [])
                .filter((tp) => tp.userId !== userId)
                .map((tp) => ({
                  firstName: tp.user.firstName,
                  lastName: tp.user.lastName,
                  level: effectiveLevel(tp.userId, states),
                })),
              opponents: (opponentTeam?.players ?? []).map((tp) => ({
                firstName: tp.user.firstName,
                lastName: tp.user.lastName,
                level: effectiveLevel(tp.userId, states),
              })),
              sets: setExplanations.length > 0 ? setExplanations : undefined,
            });
          }

          state.levelChange += update.levelChange;
          if (trackReliabilitySets) {
            state.allSets.push(...setScores);
          }
          updateWinLossTie(state, isWinner, isLoss, isTie);
        }
      };

      applyTeamRating(
        teamA.players,
        teamAOwnAvg,
        teamBOwnAvg,
        teamAWins,
        teamBWins,
        validSets.map((set) => ({
          teamAScore: set.teamAScore,
          teamBScore: set.teamBScore,
          isTieBreak: set.isTieBreak || false,
        })),
      );

      applyTeamRating(
        teamB.players,
        teamBOwnAvg,
        teamAOwnAvg,
        teamBWins,
        teamAWins,
        validSets.map((set) => ({
          teamAScore: set.teamBScore,
          teamBScore: set.teamAScore,
          isTieBreak: set.isTieBreak || false,
        })),
      );
    }
  }

  const userState = states.get(userId);
  const simulatedLevelChange = userState?.levelChange ?? 0;
  const averageOpponentLevel =
    opponentLevels.length > 0
      ? opponentLevels.reduce((sum, l) => sum + l, 0) / opponentLevels.length
      : 0;

  const clampedReliability = Math.max(0.0, Math.min(100.0, startingReliability));
  const reliabilityCoefficient = Math.max(
    0.1,
    Math.exp(-0.108 * Math.pow(clampedReliability, 0.68)),
  );

  let placementRatingFloor: ExplanationData['placementRatingFloor'] = undefined;
  let levelChange: number;
  let reliabilityChange: number;
  let summaryWins: number;
  let summaryLosses: number;
  let summaryDraws: number;

  if (existingOutcome) {
    levelChange = existingOutcome.levelChange;
    reliabilityChange = existingOutcome.reliabilityChange;
    summaryWins = existingOutcome.wins;
    summaryLosses = existingOutcome.losses;
    summaryDraws = existingOutcome.ties;

    const floorMeta = readPlacementFloorMetadata(existingOutcome.metadata);
    if (floorMeta && floorMeta.uncappedLevelChange < 0 && levelChange === 0) {
      placementRatingFloor = {
        applied: true,
        uncappedLevelChange: floorMeta.uncappedLevelChange,
      };
    }
  } else {
    let aggregatedLevelChange = simulatedLevelChange;
    if (
      game.affectsRating &&
      isPlacementProtectedFromNegativeRating(
        game.entityType,
        null,
        game.affectsRating,
      ) &&
      aggregatedLevelChange < 0
    ) {
      placementRatingFloor = {
        applied: true,
        uncappedLevelChange: aggregatedLevelChange,
      };
      aggregatedLevelChange = 0;
    }

    const finalLevel = Math.max(1.0, Math.min(7.0, startingLevel + aggregatedLevelChange));
    levelChange = finalLevel - startingLevel;
    reliabilityChange = calculateReliabilityChange(userState?.allSets ?? [], ratingBallsInGames);
    summaryWins = userState?.wins ?? 0;
    summaryLosses = userState?.losses ?? 0;
    summaryDraws = userState?.ties ?? 0;
  }

  return {
    userId,
    userLevel: startingLevel,
    userReliability: startingReliability,
    userGamesPlayed: userSport.gamesPlayed,
    levelChange,
    reliabilityChange,
    reliabilityCoefficient,
    matches,
    summary: {
      totalMatches: summaryWins + summaryLosses + summaryDraws,
      wins: summaryWins,
      losses: summaryLosses,
      draws: summaryDraws,
      averageOpponentLevel,
    },
    placementRatingFloor,
  };
}

export async function getOutcomeExplanation(
  gameId: string,
  userId: string,
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
                      user: { select: userSelectForExplanation },
                    },
                  },
                },
              },
              sets: { orderBy: { setNumber: 'asc' } },
            },
          },
        },
      },
      participants: {
        include: {
          user: { select: userSelectForExplanation },
        },
      },
      outcomes: {
        select: {
          userId: true,
          levelBefore: true,
          reliabilityBefore: true,
        },
      },
    },
  });

  if (!game) return null;

  const participant = game.participants.find((p) => p.userId === userId);
  if (!participant) return null;

  const existingOutcome = await prisma.gameOutcome.findUnique({
    where: {
      gameId_userId: { gameId, userId },
    },
    select: {
      levelBefore: true,
      levelAfter: true,
      levelChange: true,
      reliabilityBefore: true,
      reliabilityAfter: true,
      reliabilityChange: true,
      position: true,
      wins: true,
      ties: true,
      losses: true,
      metadata: true,
    },
  });

  const ratingExplanation = buildOutcomeRatingExplanation(
    {
      ...game,
      participants: game.participants,
      outcomes: game.outcomes,
      rounds: game.rounds,
    },
    userId,
    existingOutcome,
  );

  let socialLevelChangeData = undefined;
  if (game.entityType !== EntityType.BAR && game.entityType !== EntityType.LEAGUE_SEASON) {
    const socialLevelEvent = await prisma.levelChangeEvent.findFirst({
      where: {
        gameId,
        userId,
        eventType: LevelChangeEventType.SOCIAL_PARTICIPANT,
      },
    });

    if (socialLevelEvent) {
      const currentParticipant = game.participants.find((p) => p.userId === userId);
      if (currentParticipant) {
        const playingParticipants = game.participants.filter((p) => p.status === 'PLAYING');
        const allParticipants = game.participants;

        const parentGameParticipants = game.parentId
          ? await prisma.gameParticipant.findMany({
              where: {
                gameId: game.parentId,
                userId: { in: allParticipants.map((p) => p.userId) },
              },
              select: {
                userId: true,
                role: true,
              },
            })
          : [];

        const parentParticipantMap = new Map(
          parentGameParticipants.map((p) => [p.userId, p.role]),
        );

        let baseBoost = 0.0;
        const participantBreakdown: Array<{
          participantId: string;
          participantName: string;
          gamesPlayedTogether: number;
          boost: number;
        }> = [];

        for (const otherParticipant of playingParticipants) {
          if (otherParticipant.userId === userId) continue;

          const numberOfPlayedGames = await countCoPlayedGames(
            userId,
            otherParticipant.userId,
            gameId,
            game.startTime,
          );

          const boost =
            SOCIAL_PARTICIPANT_LEVEL.MAX_BOOST_PER_RELATIONSHIP -
            Math.min(SOCIAL_PARTICIPANT_LEVEL.MAX_GAMES_FOR_REDUCTION, numberOfPlayedGames) *
              SOCIAL_PARTICIPANT_LEVEL.REDUCTION_PER_GAME;

          baseBoost += boost;

          const otherUser = otherParticipant.user;
          participantBreakdown.push({
            participantId: otherParticipant.userId,
            participantName:
              `${otherUser.firstName || ''} ${otherUser.lastName || ''}`.trim() || 'Unknown',
            gamesPlayedTogether: numberOfPlayedGames,
            boost,
          });
        }

        const multiplier = getRoleMultiplier(
          currentParticipant.role,
          parentParticipantMap.get(userId),
          currentParticipant.status === 'PLAYING',
        );

        const roleName = getRoleName(
          currentParticipant.role,
          parentParticipantMap.get(userId),
          currentParticipant.status === 'PLAYING',
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
    ...ratingExplanation,
    socialLevelChange: socialLevelChangeData,
  };
}

async function countCoPlayedGames(
  userId1: string,
  userId2: string,
  currentGameId: string,
  currentGameStartTime: Date,
): Promise<number> {
  const games = await prisma.game.findMany({
    where: {
      id: { not: currentGameId },
      startTime: { lt: currentGameStartTime },
      entityType: { notIn: [EntityType.BAR, EntityType.LEAGUE_SEASON] },
      AND: [
        { participants: { some: { userId: userId1, status: 'PLAYING' } } },
        { participants: { some: { userId: userId2, status: 'PLAYING' } } },
      ],
    },
    select: { id: true },
  });

  return games.length;
}

function getRoleMultiplier(
  currentRole: ParticipantRole,
  parentRole: ParticipantRole | undefined,
  isPlaying: boolean,
): number {
  if (currentRole === ParticipantRole.OWNER) {
    return isPlaying ? ROLE_MULTIPLIERS.OWNER.PLAYED : ROLE_MULTIPLIERS.OWNER.NOT_PLAYED;
  }

  if (parentRole === ParticipantRole.OWNER) {
    return isPlaying
      ? ROLE_MULTIPLIERS.PARENT_OWNER.PLAYED
      : ROLE_MULTIPLIERS.PARENT_OWNER.NOT_PLAYED;
  }

  if (currentRole === ParticipantRole.ADMIN) {
    return isPlaying ? ROLE_MULTIPLIERS.ADMIN.PLAYED : ROLE_MULTIPLIERS.ADMIN.NOT_PLAYED;
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
  isPlaying: boolean,
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
