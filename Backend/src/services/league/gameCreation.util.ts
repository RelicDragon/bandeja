import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import {
  EntityType,
  Prisma,
  WinnerOfGame,
  WinnerOfMatch,
  MatchGenerationType,
  ScoringPreset,
} from '@prisma/client';
import { GameService } from '../game/game.service';
import type { GameReadinessDb } from '../game/readiness.service';
import {
  normalizeGameFormatPatch,
  type GameFormatExistingGame,
} from '../../utils/gameFormat/normalizeGameFormatPatch';
import { resolveMatchGenerationType } from '../../utils/game/resolveMatchGenerationType';
import { getSportConfig, resolvePlayersPerMatch } from '../../sport/sportRegistry';
import {
  assertGameSportMatchesLeagueSeason,
  loadLeagueSeasonSportOrThrow,
} from '../../utils/validators/validateLeagueSeasonSport';
import type { Sport } from '@prisma/client';
import { validateGameForSport } from '../../utils/validators/validateGameForSport';

export function resolveLeagueMatchCapacity(
  seasonSport: Sport,
  seasonGame: { playersPerMatch?: number | null },
  participantUserIds: string[],
): { playersPerMatch: 2 | 4; maxParticipants: number; minParticipants: number } {
  const playersPerMatch = resolvePlayersPerMatch(seasonSport, seasonGame.playersPerMatch);
  const rosterSize = participantUserIds.length;
  return {
    playersPerMatch,
    maxParticipants: Math.max(rosterSize, playersPerMatch),
    minParticipants: playersPerMatch,
  };
}

const PLAYOFF_GAME_TYPE_TEMPLATES: Record<
  'WINNER_COURT' | 'AMERICANO',
  { winnerOfMatch: WinnerOfMatch; winnerOfGame: WinnerOfGame; matchGenerationType: MatchGenerationType; fixedNumberOfSets: number; ballsInGames: boolean }
> = {
  WINNER_COURT: {
    winnerOfMatch: WinnerOfMatch.BY_SCORES,
    winnerOfGame: WinnerOfGame.BY_MATCHES_WON,
    matchGenerationType: MatchGenerationType.WINNERS_COURT,
    fixedNumberOfSets: 1,
    ballsInGames: false,
  },
  AMERICANO: {
    winnerOfMatch: WinnerOfMatch.BY_SCORES,
    winnerOfGame: WinnerOfGame.BY_SCORES_DELTA,
    matchGenerationType: MatchGenerationType.RANDOM,
    fixedNumberOfSets: 1,
    ballsInGames: false,
  },
};

interface CreateLeagueGameParams {
  leagueRoundId: string;
  seasonGame: any;
  leagueSeasonId: string;
  team1PlayerIds: string[];
  team2PlayerIds: string[];
  leagueGroupId?: string;
  maxParticipants?: number;
  minParticipants?: number;
  isPublic?: boolean;
  affectsRating?: boolean;
  gameSetup?: PlayoffGameSetupOverrides;
  db?: GameReadinessDb;
}

export type ResolveLeagueFormatOptions = {
  entityType?: EntityType;
  hasFixedTeams?: boolean;
  maxParticipants?: number;
  playersPerMatch?: number;
  gameType?: string;
  resultsRoundGenV2?: unknown;
};

export function resolveLeagueFixtureFormatFields(
  seasonGame: {
    gameType?: string | null;
    playersPerMatch?: number | null;
    maxParticipants?: number | null;
    allowUserInMultipleTeams?: boolean | null;
    fixedNumberOfSets?: number | null;
    maxTotalPointsPerSet?: number | null;
    matchTimerEnabled?: boolean | null;
    matchTimedCapMinutes?: number | null;
    maxPointsPerTeam?: number | null;
    winnerOfGame?: WinnerOfGame | null;
    winnerOfMatch?: WinnerOfMatch | null;
    matchGenerationType?: MatchGenerationType | null;
    pointsPerWin?: number | null;
    pointsPerLoose?: number | null;
    pointsPerTie?: number | null;
    scoringPreset?: string | null;
    scoringMode?: string | null;
    deucesBeforeGoldenPoint?: number | null;
    hasGoldenPoint?: boolean | null;
    ballsInGames?: boolean | null;
  },
  gameSetup?: PlayoffGameSetupOverrides,
  options?: ResolveLeagueFormatOptions,
) {
  const entityType = options?.entityType ?? EntityType.LEAGUE;
  const patch = {
    fixedNumberOfSets: gameSetup?.fixedNumberOfSets ?? seasonGame.fixedNumberOfSets ?? 0,
    maxTotalPointsPerSet: gameSetup?.maxTotalPointsPerSet ?? seasonGame.maxTotalPointsPerSet ?? 0,
    matchTimedCapMinutes: gameSetup?.matchTimedCapMinutes ?? seasonGame.matchTimedCapMinutes ?? 0,
    matchTimerEnabled: gameSetup?.matchTimerEnabled ?? seasonGame.matchTimerEnabled ?? false,
    maxPointsPerTeam: gameSetup?.maxPointsPerTeam ?? seasonGame.maxPointsPerTeam ?? 0,
    winnerOfGame:
      (gameSetup?.winnerOfGame as WinnerOfGame | undefined) ??
      (seasonGame.winnerOfGame as WinnerOfGame | undefined) ??
      WinnerOfGame.BY_MATCHES_WON,
    winnerOfMatch:
      (gameSetup?.winnerOfMatch as WinnerOfMatch | undefined) ??
      (seasonGame.winnerOfMatch as WinnerOfMatch | undefined) ??
      WinnerOfMatch.BY_SCORES,
    matchGenerationType:
      (gameSetup?.matchGenerationType as MatchGenerationType | undefined) ??
      (seasonGame.matchGenerationType as MatchGenerationType | undefined) ??
      MatchGenerationType.HANDMADE,
    pointsPerWin: gameSetup?.pointsPerWin ?? seasonGame.pointsPerWin ?? 0,
    pointsPerLoose: gameSetup?.pointsPerLoose ?? seasonGame.pointsPerLoose ?? 0,
    pointsPerTie: gameSetup?.pointsPerTie ?? seasonGame.pointsPerTie ?? 0,
    scoringPreset:
      (gameSetup?.scoringPreset as ScoringPreset | null | undefined) ??
      (seasonGame.scoringPreset as ScoringPreset | null) ??
      null,
    scoringMode:
      gameSetup?.scoringMode != null
        ? String(gameSetup.scoringMode)
        : seasonGame.scoringMode != null
          ? String(seasonGame.scoringMode)
          : null,
    deucesBeforeGoldenPoint: gameSetup?.deucesBeforeGoldenPoint ?? seasonGame.deucesBeforeGoldenPoint ?? null,
    ...(gameSetup?.hasGoldenPoint !== undefined || seasonGame.hasGoldenPoint !== undefined
      ? { hasGoldenPoint: gameSetup?.hasGoldenPoint ?? seasonGame.hasGoldenPoint ?? false }
      : {}),
    ballsInGames: gameSetup?.ballsInGames,
    gameType: options?.gameType ?? seasonGame.gameType ?? 'CLASSIC',
    playersPerMatch: options?.playersPerMatch ?? seasonGame.playersPerMatch ?? 4,
    hasFixedTeams: options?.hasFixedTeams ?? true,
    allowUserInMultipleTeams: seasonGame.allowUserInMultipleTeams ?? false,
    maxParticipants: options?.maxParticipants ?? seasonGame.maxParticipants ?? 4,
    resultsRoundGenV2: options?.resultsRoundGenV2,
  };

  const normalized = normalizeGameFormatPatch({
    existingGame: seasonGame as GameFormatExistingGame,
    patch,
    entityType,
  });

  return {
    fixedNumberOfSets: (normalized.fixedNumberOfSets as number | undefined) ?? patch.fixedNumberOfSets,
    maxTotalPointsPerSet:
      (normalized.maxTotalPointsPerSet as number | undefined) ?? patch.maxTotalPointsPerSet,
    matchTimedCapMinutes:
      (normalized.matchTimedCapMinutes as number | undefined) ?? patch.matchTimedCapMinutes,
    matchTimerEnabled:
      (normalized.matchTimerEnabled as boolean | undefined) ?? patch.matchTimerEnabled,
    maxPointsPerTeam: (normalized.maxPointsPerTeam as number | undefined) ?? patch.maxPointsPerTeam,
    winnerOfGame: (normalized.winnerOfGame as WinnerOfGame | undefined) ?? patch.winnerOfGame,
    winnerOfMatch: (normalized.winnerOfMatch as WinnerOfMatch | undefined) ?? patch.winnerOfMatch,
    matchGenerationType:
      (normalized.matchGenerationType as MatchGenerationType | undefined) ??
      resolveMatchGenerationType({
        resultsRoundGenV2: options?.resultsRoundGenV2,
        matchGenerationType: patch.matchGenerationType,
        maxParticipants: patch.maxParticipants,
        playersPerMatch: patch.playersPerMatch,
      }) ??
      patch.matchGenerationType,
    pointsPerWin: (normalized.pointsPerWin as number | undefined) ?? patch.pointsPerWin,
    pointsPerLoose: (normalized.pointsPerLoose as number | undefined) ?? patch.pointsPerLoose,
    pointsPerTie: (normalized.pointsPerTie as number | undefined) ?? patch.pointsPerTie,
    scoringPreset: (normalized.scoringPreset as ScoringPreset | null | undefined) ?? patch.scoringPreset,
    scoringMode: (normalized.scoringMode as string | null | undefined) ?? patch.scoringMode,
    deucesBeforeGoldenPoint:
      (normalized.deucesBeforeGoldenPoint as number | null | undefined) ?? patch.deucesBeforeGoldenPoint,
    ballsInGames:
      typeof gameSetup?.ballsInGames === 'boolean'
        ? gameSetup.ballsInGames
        : (normalized.ballsInGames as boolean | undefined) ?? false,
  };
}

/** Validates bracket/session playoff format overrides against `LeagueSeason.sport`. */
export function validatePlayoffGameSetupForSeason(
  seasonSport: Sport,
  seasonGame: {
    gameType?: string | null;
    playersPerMatch?: number | null;
    maxParticipants?: number | null;
    scoringPreset?: string | null;
  },
  gameSetup?: PlayoffGameSetupOverrides,
  options?: { gameType?: string },
): void {
  const gameType = options?.gameType ?? seasonGame.gameType ?? 'CLASSIC';
  validateGameForSport({
    sport: seasonSport,
    entityType: EntityType.LEAGUE,
    gameType,
    playersPerMatch: seasonGame.playersPerMatch ?? undefined,
    maxParticipants: seasonGame.maxParticipants ?? 4,
    scoringPreset: gameSetup?.scoringPreset ?? seasonGame.scoringPreset ?? null,
  });
}

export interface PlayoffGameSetupOverrides {
  fixedNumberOfSets?: number;
  maxTotalPointsPerSet?: number;
  matchTimerEnabled?: boolean;
  matchTimedCapMinutes?: number;
  maxPointsPerTeam?: number;
  winnerOfGame?: WinnerOfGame;
  winnerOfMatch?: WinnerOfMatch;
  matchGenerationType?: MatchGenerationType;
  pointsPerWin?: number;
  pointsPerLoose?: number;
  pointsPerTie?: number;
  scoringPreset?: string | null;
  scoringMode?: string;
  deucesBeforeGoldenPoint?: number | null;
  /** @deprecated Legacy FE — normalized to `deucesBeforeGoldenPoint`. */
  hasGoldenPoint?: boolean;
  ballsInGames?: boolean;
}

export interface CreateLeaguePlayoffGameParams {
  leagueRoundId: string;
  leagueSeasonId: string;
  seasonGame: any;
  gameType: 'WINNER_COURT' | 'AMERICANO';
  participantUserIds: string[];
  leagueGroupId?: string;
  /** When set, one GameTeam per entry (team = array of player user IDs). Game has hasFixedTeams: true. */
  teams?: string[][];
  gameSetup?: PlayoffGameSetupOverrides;
  resultsRoundGenV2?: boolean;
}

export async function createLeagueGame(params: CreateLeagueGameParams) {
  const {
    leagueRoundId,
    seasonGame,
    leagueSeasonId,
    team1PlayerIds,
    team2PlayerIds,
    leagueGroupId,
    maxParticipants: maxParticipantsParam,
    minParticipants: minParticipantsParam,
    isPublic = false,
    affectsRating = true,
    gameSetup,
    db: dbClient = prisma,
  } = params;

  const round = await dbClient.leagueRound.findUnique({
    where: { id: leagueRoundId },
  });

  if (!round) {
    throw new ApiError(404, 'League round not found');
  }

  const normalizeUserIds = (ids: Array<string | null | undefined>) =>
    Array.from(
      new Set(
        ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      )
    );

  const participantUserIds = normalizeUserIds([...team1PlayerIds, ...team2PlayerIds]);
  const normalizedTeam1PlayerIds = normalizeUserIds(team1PlayerIds);
  const normalizedTeam2PlayerIds = normalizeUserIds(team2PlayerIds);

  if (normalizedTeam1PlayerIds.length === 0 || normalizedTeam2PlayerIds.length === 0) {
    throw new ApiError(400, 'Each fixed team must contain at least one valid participant');
  }

  if (participantUserIds.length < 2) {
    throw new ApiError(400, 'League game requires at least 2 distinct participants');
  }

  const seasonSport = await loadLeagueSeasonSportOrThrow(leagueSeasonId, dbClient);
  if (seasonGame.sport) {
    assertGameSportMatchesLeagueSeason(seasonGame.sport, { sport: seasonSport });
  }
  const capacity = resolveLeagueMatchCapacity(seasonSport, seasonGame, participantUserIds);
  const playersPerMatch = capacity.playersPerMatch;
  const maxParticipants = maxParticipantsParam ?? capacity.maxParticipants;
  const minParticipants = minParticipantsParam ?? capacity.minParticipants;

  const allowUserInMultipleTeams =
    maxParticipants === 2 ? false : Boolean(seasonGame.allowUserInMultipleTeams);
  if (!allowUserInMultipleTeams) {
    const team1Set = new Set(normalizedTeam1PlayerIds);
    const hasOverlap = normalizedTeam2PlayerIds.some((userId) => team1Set.has(userId));
    if (hasOverlap) {
      throw new ApiError(400, 'Fixed teams must not share participants');
    }
  }
  const startTime = new Date();
  const endTime = new Date(startTime.getTime() + 1 * 60 * 60 * 1000);
  const format = resolveLeagueFixtureFormatFields(seasonGame, gameSetup);

  const game = await dbClient.game.create({
    data: {
      entityType: EntityType.LEAGUE,
      sport: seasonSport,
      gameType: seasonGame.gameType || 'CLASSIC',
      name: `Round ${round.orderIndex + 1} - Game`,
      clubId: seasonGame.clubId,
      cityId: seasonGame.cityId,
      startTime,
      endTime,
      maxParticipants,
      playersPerMatch,
      minParticipants,
      minLevel: seasonGame.minLevel,
      maxLevel: seasonGame.maxLevel,
      isPublic,
      affectsRating,
      anyoneCanInvite: false,
      resultsByAnyone: true,
      allowDirectJoin: false,
      hasBookedCourt: false,
      afterGameGoToBar: false,
      hasFixedTeams: true,
      allowUserInMultipleTeams,
      genderTeams: seasonGame.genderTeams || 'ANY',
      ...format,
      parentId: leagueSeasonId,
      leagueRoundId: leagueRoundId,
      leagueGroupId,
      status: 'ANNOUNCED',
      participants: {
        create: participantUserIds.map(userId => ({
          userId,
          role: 'PARTICIPANT' as const,
          status: 'PLAYING',
        })),
      },
    },
  });

  await dbClient.gameTeam.create({
    data: {
      gameId: game.id,
      teamNumber: 1,
      players: {
        create: normalizedTeam1PlayerIds.map(userId => ({ userId })),
      },
    },
  });

  await dbClient.gameTeam.create({
    data: {
      gameId: game.id,
      teamNumber: 2,
      players: {
        create: normalizedTeam2PlayerIds.map(userId => ({ userId })),
      },
    },
  });

  await GameService.updateGameReadiness(game.id, dbClient);

  return game;
}

export async function createLeaguePlayoffGame(
  params: CreateLeaguePlayoffGameParams,
  tx?: Prisma.TransactionClient
) {
  const {
    leagueRoundId,
    leagueSeasonId,
    seasonGame,
    gameType,
    participantUserIds,
    leagueGroupId,
    teams,
    gameSetup,
    resultsRoundGenV2,
  } = params;
  const db = tx ?? prisma;

  const round = await db.leagueRound.findUnique({
    where: { id: leagueRoundId },
  });

  if (!round) {
    throw new ApiError(404, 'League round not found');
  }

  const template = PLAYOFF_GAME_TYPE_TEMPLATES[gameType as 'WINNER_COURT' | 'AMERICANO'];
  const userIds = Array.from(
    new Set(
      participantUserIds.filter(
        (userId): userId is string => typeof userId === 'string' && userId.trim().length > 0
      )
    )
  );
  if (userIds.length === 0) {
    throw new ApiError(400, 'Playoff game requires at least one valid participant');
  }

  const seasonSport = await loadLeagueSeasonSportOrThrow(leagueSeasonId, db);
  if (seasonGame.sport) {
    assertGameSportMatchesLeagueSeason(seasonGame.sport, { sport: seasonSport });
  }
  if (gameType === 'AMERICANO' && !getSportConfig(seasonSport).rotationFormats.americano) {
    throw new ApiError(400, 'Americano session playoffs are not available for this sport');
  }
  const playersPerMatch = resolvePlayersPerMatch(seasonSport, seasonGame.playersPerMatch);
  const participantCount = Math.max(userIds.length, playersPerMatch);
  const hasFixedTeams = Boolean(teams?.length);
  const allowUserInMultipleTeams = Boolean(seasonGame.allowUserInMultipleTeams);
  const startTime = new Date();
  const endTime = new Date(startTime.getTime() + 1 * 60 * 60 * 1000);

  if (hasFixedTeams && teams?.length && !allowUserInMultipleTeams) {
    const seen = new Set<string>();
    for (const row of teams) {
      const ids = Array.from(
        new Set(
          row.filter((userId): userId is string => typeof userId === 'string' && userId.trim().length > 0)
        )
      );
      for (const id of ids) {
        if (seen.has(id)) {
          throw new ApiError(400, 'Playoff fixed teams must not share participants');
        }
        seen.add(id);
      }
    }
  }

  const format = resolveLeagueFixtureFormatFields(
    seasonGame,
    {
      ...gameSetup,
      fixedNumberOfSets: gameSetup?.fixedNumberOfSets ?? template.fixedNumberOfSets,
      winnerOfGame: (gameSetup?.winnerOfGame ?? template.winnerOfGame) as WinnerOfGame,
      winnerOfMatch: (gameSetup?.winnerOfMatch ?? template.winnerOfMatch) as WinnerOfMatch,
      matchGenerationType: (gameSetup?.matchGenerationType ??
        template.matchGenerationType) as MatchGenerationType,
    },
    {
      hasFixedTeams,
      maxParticipants: participantCount,
      playersPerMatch,
      gameType,
      resultsRoundGenV2,
    },
  );

  const game = await db.game.create({
    data: {
      entityType: EntityType.LEAGUE,
      sport: seasonSport,
      gameType,
      name: `Playoff - ${gameType === 'WINNER_COURT' ? 'Winners Court' : 'Americano'}`,
      clubId: seasonGame.clubId,
      cityId: seasonGame.cityId,
      startTime,
      endTime,
      maxParticipants: participantCount,
      playersPerMatch,
      minParticipants: 4,
      minLevel: seasonGame.minLevel,
      maxLevel: seasonGame.maxLevel,
      isPublic: false,
      affectsRating: seasonGame.affectsRating ?? true,
      anyoneCanInvite: false,
      resultsByAnyone: true,
      allowDirectJoin: false,
      hasBookedCourt: false,
      afterGameGoToBar: false,
      hasFixedTeams,
      allowUserInMultipleTeams,
      genderTeams: seasonGame.genderTeams || 'ANY',
      ...format,
      parentId: leagueSeasonId,
      leagueRoundId,
      leagueGroupId,
      status: 'ANNOUNCED',
      participants: {
        create: userIds.map((userId) => ({
          userId,
          role: 'PARTICIPANT' as const,
          status: 'PLAYING',
        })),
      },
    },
  });

  if (hasFixedTeams && teams?.length) {
    for (let i = 0; i < teams.length; i++) {
      const normalizedTeamUserIds = Array.from(
        new Set(
          teams[i].filter(
            (userId): userId is string => typeof userId === 'string' && userId.trim().length > 0
          )
        )
      );

      if (normalizedTeamUserIds.length === 0) {
        throw new ApiError(400, 'Each fixed playoff team must contain at least one valid participant');
      }

      await db.gameTeam.create({
        data: {
          gameId: game.id,
          teamNumber: i + 1,
          players: {
            create: normalizedTeamUserIds.map((userId) => ({ userId })),
          },
        },
      });
    }
  }

  if (!tx) {
    await GameService.updateGameReadiness(game.id);
  }

  return game;
}
