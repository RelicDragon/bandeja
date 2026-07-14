import { MAIN_PHOTO_RELATION_SELECT } from './gamePrismaIncludes';

/** Minimal sport profile fields needed to project card-level `level` on Find. */
export const FIND_CARD_SPORT_PROFILE_SELECT = {
  sport: true,
  level: true,
  reliability: true,
  gamesPlayed: true,
  gamesWon: true,
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

const leagueSeasonCardInclude = {
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

/**
 * Prisma include for Find available / upcoming card payloads.
 * Intentionally omits full USER_SELECT_WITH_SPORT_PROFILES, club integrationConfig,
 * telegramGroupId, and resultsArtifactJob.
 *
 * Size/cost vs prior Find include (before #281):
 * - participants.user: dropped bio/verbalStatus/weeklyAvailability/availabilityBucketBoundaries/
 *   socialLevel; sportProfiles trimmed to level/reliability/gamesPlayed/gamesWon only
 *   (no streak/questionnaire/uncertainty columns).
 * - club/court.club: dropped integrationType + integrationConfig JSON.
 * - city: dropped telegramGroupId.
 * - dropped resultsArtifactJob join + response artifacts/linkedBookings projection.
 * Typical busy-city month: fewer JOINed user columns and no integrationConfig blobs per club nest.
 */
export function getAvailableGamesCardInclude() {
  return {
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
    participants: {
      select: {
        id: true,
        userId: true,
        gameId: true,
        role: true,
        status: true,
        joinedAt: true,
        inviteMessage: true,
        inviteExpiresAt: true,
        user: {
          select: FIND_CARD_USER_SELECT,
        },
      },
    },
    leagueSeason: {
      include: leagueSeasonCardInclude,
    },
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
        leagueSeason: {
          include: leagueSeasonCardInclude,
        },
      },
    },
    mainPhoto: MAIN_PHOTO_RELATION_SELECT,
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
      const user = (participant as Record<string, unknown>).user as
        | Record<string, unknown>
        | null
        | undefined;
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
