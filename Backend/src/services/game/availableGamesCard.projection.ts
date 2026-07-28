import type { Prisma } from '@prisma/client';
import { MAIN_PHOTO_RELATION_SELECT } from './gamePrismaIncludes';

/** Minimal sport profile fields needed to project card-level `level` + confirmation on Find. */
export const FIND_CARD_SPORT_PROFILE_SELECT = {
  sport: true,
  level: true,
  reliability: true,
  gamesPlayed: true,
  gamesWon: true,
  approvedLevel: true,
  approvedById: true,
  approvedWhen: true,
} as const;

/** Slim user projection for Find cards (no bio/availability/social dumps). */
export const FIND_CARD_USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  avatar: true,
  gender: true,
  approvedLevel: true,
  isPremium: true,
  isTrainer: true,
  primarySport: true,
  sportsEnabled: true,
  trainerRating: true,
  trainerReviewCount: true,
  sportProfiles: {
    select: FIND_CARD_SPORT_PROFILE_SELECT,
  },
} as const;

/**
 * Game scalars required by Find GameCard / residual filters.
 * Omits description, mediaUrls, metadata, scoring dumps, telegram/summary texts, etc.
 */
export const FIND_CARD_GAME_SELECT = {
  id: true,
  entityType: true,
  sport: true,
  gameType: true,
  name: true,
  clubId: true,
  courtId: true,
  cityId: true,
  startTime: true,
  endTime: true,
  maxParticipants: true,
  playersPerMatch: true,
  minLevel: true,
  maxLevel: true,
  isPublic: true,
  affectsRating: true,
  hasBookedCourt: true,
  bookingStatus: true,
  hasFixedTeams: true,
  genderTeams: true,
  status: true,
  resultsStatus: true,
  photosCount: true,
  forbidOthersPhotosView: true,
  parentId: true,
  trainerId: true,
  leagueRoundId: true,
  leagueGroupId: true,
  timeIsSet: true,
  timeOverride: true,
  /** Legacy FE `hasGoldenPoint` projection. */
  deucesBeforeGoldenPoint: true,
} as const;

const leagueSeasonCardSelect = {
  select: {
    id: true,
    league: {
      select: {
        id: true,
        name: true,
      },
    },
    game: {
      select: {
        id: true,
        name: true,
        avatar: true,
        originalAvatar: true,
        sport: true,
      },
    },
  },
} as const;

const clubCardSelect = {
  id: true,
  name: true,
  avatar: true,
  address: true,
  cityId: true,
  city: {
    select: {
      timezone: true,
    },
  },
} as const;

const findCardParticipantSelect = {
  id: true,
  userId: true,
  gameId: true,
  role: true,
  status: true,
  user: {
    select: FIND_CARD_USER_SELECT,
  },
} as const;

/** Statuses (plus OWNER/ADMIN role / viewer row) needed for Find card UI. */
export const FIND_CARD_PARTICIPANT_STATUSES = ['PLAYING', 'IN_QUEUE', 'INVITED'] as const;

function findCardParticipantsWhere(viewerUserId?: string): Prisma.GameParticipantWhereInput {
  const or: Prisma.GameParticipantWhereInput[] = [
    { status: { in: [...FIND_CARD_PARTICIPANT_STATUSES] } },
    { role: { in: ['OWNER', 'ADMIN'] } },
  ];
  if (viewerUserId) {
    or.push({ userId: viewerUserId });
  }
  return { OR: or };
}

const findCardRelationSelect = {
  city: {
    select: {
      id: true,
      name: true,
      country: true,
      timezone: true,
    },
  },
  club: {
    select: clubCardSelect,
  },
  court: {
    select: {
      id: true,
      name: true,
      clubId: true,
      club: {
        select: {
          id: true,
          name: true,
          avatar: true,
          address: true,
          city: {
            select: {
              name: true,
              timezone: true,
            },
          },
        },
      },
    },
  },
  leagueSeason: leagueSeasonCardSelect,
  leagueGroup: {
    select: {
      id: true,
      name: true,
      color: true,
    },
  },
  leagueRound: {
    select: {
      id: true,
      orderIndex: true,
      roundType: true,
      playoffFormat: true,
      bracketScope: true,
    },
  },
  parent: {
    select: {
      id: true,
      leagueSeason: leagueSeasonCardSelect,
    },
  },
  mainPhoto: MAIN_PHOTO_RELATION_SELECT,
} as const;

export type AvailableGamesCardSelectOptions = {
  /** Always include the viewer's participant row (invite / queue / join state). */
  viewerUserId?: string;
};

/**
 * Prisma `select` for Find available / upcoming card payloads (not `include` —
 * `include` still loads every Game scalar).
 *
 * Outcomes are attached separately for FINAL games only (see availableGamesQuery).
 */
export function getAvailableGamesCardSelect(
  options?: AvailableGamesCardSelectOptions,
): Prisma.GameSelect {
  return {
    ...FIND_CARD_GAME_SELECT,
    ...findCardRelationSelect,
    participants: {
      where: findCardParticipantsWhere(options?.viewerUserId),
      select: findCardParticipantSelect,
    },
  };
}

/**
 * @deprecated Prefer {@link getAvailableGamesCardSelect}. Kept for callers/tests that
 * still inspect the relation shape; does not include Game scalars.
 */
export function getAvailableGamesCardInclude(options?: AvailableGamesCardSelectOptions) {
  return {
    ...findCardRelationSelect,
    participants: {
      where: findCardParticipantsWhere(options?.viewerUserId),
      select: findCardParticipantSelect,
    },
    /** Slim standings for FINAL GameCard place badges — prefer deferred attach. */
    outcomes: {
      where: { position: { not: null } },
      select: {
        userId: true,
        position: true,
      },
      orderBy: { position: 'asc' as const },
    },
  } as const;
}

/** Fields that must not appear on Find card participant users. */
export const FIND_CARD_FORBIDDEN_USER_KEYS = [
  'bio',
  'verbalStatus',
  'weeklyAvailability',
  'availabilityBucketBoundaries',
  'socialLevel',
  'phone',
  'email',
] as const;

/** Nested keys that must not appear on Find card club/city. */
export const FIND_CARD_FORBIDDEN_NESTED_KEYS = [
  'integrationConfig',
  'integrationType',
  'telegramGroupId',
] as const;

/** Fat Game scalars that must not appear on Find card responses. */
export const FIND_CARD_FORBIDDEN_GAME_KEYS = [
  'description',
  'mediaUrls',
  'metadata',
  'telegramResultsSummary',
  'resultsSummaryText',
  'resultsMeta',
  'lastMessagePreview',
] as const;

export type AvailableGamesCardContractIssue = {
  path: string;
  reason: string;
};

/**
 * Contract check for Find card responses (unit / API-level).
 * Verifies slim user + club shape without full sport-profile dumps or integration blobs.
 */
export function collectAvailableGamesCardContractIssues(
  games: unknown[],
): AvailableGamesCardContractIssue[] {
  const issues: AvailableGamesCardContractIssue[] = [];

  games.forEach((game, gameIndex) => {
    if (!game || typeof game !== 'object') {
      issues.push({ path: `[${gameIndex}]`, reason: 'not an object' });
      return;
    }
    const g = game as Record<string, unknown>;
    if (typeof g.id !== 'string') {
      issues.push({ path: `[${gameIndex}].id`, reason: 'missing id' });
    }
    if (g.resultsArtifactJob != null) {
      issues.push({
        path: `[${gameIndex}].resultsArtifactJob`,
        reason: 'resultsArtifactJob must not be loaded for Find cards',
      });
    }
    for (const key of FIND_CARD_FORBIDDEN_GAME_KEYS) {
      if (key in g && g[key] != null) {
        issues.push({
          path: `[${gameIndex}].${key}`,
          reason: `${key} must not be loaded for Find cards`,
        });
      }
    }

    const city = g.city as Record<string, unknown> | null | undefined;
    if (city && 'telegramGroupId' in city) {
      issues.push({
        path: `[${gameIndex}].city.telegramGroupId`,
        reason: 'telegramGroupId not part of Find card city',
      });
    }

    for (const clubPath of ['club', 'court.club'] as const) {
      const club =
        clubPath === 'club'
          ? (g.club as Record<string, unknown> | null | undefined)
          : ((g.court as Record<string, unknown> | null | undefined)?.club as
              | Record<string, unknown>
              | null
              | undefined);
      if (!club) continue;
      for (const key of FIND_CARD_FORBIDDEN_NESTED_KEYS) {
        if (key in club) {
          issues.push({
            path: `[${gameIndex}].${clubPath}.${key}`,
            reason: `${key} not part of Find card club`,
          });
        }
      }
    }

    const participants = Array.isArray(g.participants) ? g.participants : [];
    participants.forEach((participant, pIndex) => {
      if (!participant || typeof participant !== 'object') return;
      const row = participant as Record<string, unknown>;
      for (const key of ['inviteMessage', 'inviteExpiresAt', 'showInStories', 'joinedAt'] as const) {
        if (key in row && row[key] != null) {
          issues.push({
            path: `[${gameIndex}].participants[${pIndex}].${key}`,
            reason: `${key} not part of Find card participant`,
          });
        }
      }
      const user = row.user as Record<string, unknown> | null | undefined;
      if (!user) {
        issues.push({
          path: `[${gameIndex}].participants[${pIndex}].user`,
          reason: 'missing user',
        });
        return;
      }
      for (const key of FIND_CARD_FORBIDDEN_USER_KEYS) {
        if (key in user) {
          issues.push({
            path: `[${gameIndex}].participants[${pIndex}].user.${key}`,
            reason: `${key} not part of Find card user`,
          });
        }
      }
      if ('sportProfiles' in user) {
        issues.push({
          path: `[${gameIndex}].participants[${pIndex}].user.sportProfiles`,
          reason: 'sportProfiles must be projected away before response',
        });
      }
      if (typeof user.level !== 'number' && user.level !== undefined) {
        issues.push({
          path: `[${gameIndex}].participants[${pIndex}].user.level`,
          reason: 'expected projected level number when present',
        });
      }
    });

    const outcomes = Array.isArray(g.outcomes) ? g.outcomes : [];
    outcomes.forEach((outcome, oIndex) => {
      if (!outcome || typeof outcome !== 'object') return;
      const row = outcome as Record<string, unknown>;
      if ('user' in row) {
        issues.push({
          path: `[${gameIndex}].outcomes[${oIndex}].user`,
          reason: 'outcome.user not part of Find card standings payload',
        });
      }
      if (typeof row.userId !== 'string') {
        issues.push({
          path: `[${gameIndex}].outcomes[${oIndex}].userId`,
          reason: 'expected outcome.userId string',
        });
      }
    });
  });

  return issues;
}

export function assertAvailableGamesCardContract(games: unknown[]): void {
  const issues = collectAvailableGamesCardContractIssues(games);
  if (issues.length > 0) {
    const detail = issues.map((i) => `${i.path}: ${i.reason}`).join('; ');
    throw new Error(`Available games card contract failed: ${detail}`);
  }
}
