import type { Prisma } from '@prisma/client';
import { GAME_INVITE_OUTCOME_INCLUDE } from '../../utils/gameInviteOutcomeInclude';
import {
  USER_SELECT_FIELDS,
  USER_SELECT_WITH_SPORT_PROFILES,
  USER_SPORT_PROFILE_SELECT,
} from '../../utils/constants';

export const MAIN_PHOTO_RELATION_SELECT = {
  select: {
    id: true,
    thumbnailUrl: true,
    originalUrl: true,
  },
} as const;

const leagueSeasonInclude = {
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

export const levelProjectionUserSelect = {
  ...USER_SELECT_FIELDS,
  sportProfiles: { select: USER_SPORT_PROFILE_SELECT },
} as const;

const roundGenerationUserSelect = {
  ...USER_SELECT_FIELDS,
  sportProfiles: { select: USER_SPORT_PROFILE_SELECT },
} as const;

export function participantWithSportUser(
  userSelect: typeof USER_SELECT_WITH_SPORT_PROFILES | typeof levelProjectionUserSelect,
  options?: { invitedByUser?: typeof USER_SELECT_WITH_SPORT_PROFILES },
) {
  return {
    include: {
      user: { select: userSelect },
      ...(options?.invitedByUser
        ? { invitedByUser: { select: options.invitedByUser } }
        : {}),
    },
  } as const;
}

type MatchPlayerInclude =
  | { select: { userId: true } }
  | { include: { user: { select: typeof USER_SELECT_WITH_SPORT_PROFILES | typeof levelProjectionUserSelect } } };

export function matchWithTeamsAndSets(playerInclude: MatchPlayerInclude) {
  return {
    include: {
      teams: {
        include: {
          players: playerInclude,
        },
      },
      sets: {
        orderBy: { setNumber: 'asc' as const },
      },
    },
    orderBy: { matchNumber: 'asc' as const },
  } as const;
}

function roundsWithMatches(playerInclude: MatchPlayerInclude) {
  return {
    include: {
      matches: matchWithTeamsAndSets(playerInclude),
    },
    orderBy: { roundNumber: 'asc' as const },
  } as const;
}

const gameCourtInclude = {
  include: {
    court: {
      include: {
        club: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
      },
    },
  },
  orderBy: { order: 'asc' as const },
} as const;

export const gameBaseInclude = {
  city: {
    select: {
      id: true,
      name: true,
      country: true,
      telegramGroupId: true,
      timezone: true,
    },
  },
  club: {
    include: {
      courts: true,
      city: {
        select: {
          name: true,
        },
      },
    },
  },
  participants: participantWithSportUser(USER_SELECT_WITH_SPORT_PROFILES, {
    invitedByUser: USER_SELECT_WITH_SPORT_PROFILES,
  }),
  inviteOutcomes: {
    include: GAME_INVITE_OUTCOME_INCLUDE,
  },
  fixedTeams: {
    include: {
      players: {
        include: {
          user: {
            select: USER_SELECT_WITH_SPORT_PROFILES,
          },
        },
      },
    },
    orderBy: { teamNumber: 'asc' as const },
  },
  leagueSeason: {
    include: leagueSeasonInclude,
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
  bracketSlot: {
    select: {
      slotKind: true,
      roundIndex: true,
    },
  },
  mainPhoto: MAIN_PHOTO_RELATION_SELECT,
  resultsArtifactJob: {
    select: {
      status: true,
      summaryStatus: true,
      photoStatus: true,
      photoGenerationsUsed: true,
    },
  },
  externalBookings: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      externalBookingId: true,
      externalBookingProvider: true,
      courtId: true,
      bookingStart: true,
      bookingEnd: true,
    },
  },
} satisfies Prisma.GameInclude;

export const gameWithRoundsAndOutcomes = {
  ...gameBaseInclude,
  court: {
    include: {
      club: true,
    },
  },
  outcomes: {
    include: {
      user: {
        select: USER_SELECT_WITH_SPORT_PROFILES,
      },
    },
    orderBy: { position: 'asc' as const },
  },
  rounds: roundsWithMatches({
    include: {
      user: { select: USER_SELECT_WITH_SPORT_PROFILES },
    },
  }),
  gameCourts: gameCourtInclude,
  parent: {
    include: {
      participants: participantWithSportUser(USER_SELECT_WITH_SPORT_PROFILES),
      leagueSeason: {
        include: leagueSeasonInclude,
      },
    },
  },
} satisfies Prisma.GameInclude;

export const gameForRoundGeneration = {
  participants: participantWithSportUser(roundGenerationUserSelect),
  fixedTeams: {
    include: {
      players: {
        include: {
          user: { select: roundGenerationUserSelect },
        },
      },
    },
    orderBy: { teamNumber: 'asc' as const },
  },
  gameCourts: {
    orderBy: { order: 'asc' as const },
  },
  rounds: roundsWithMatches({ select: { userId: true } }),
} satisfies Prisma.GameInclude;

export const gameForLevelProjection = {
  club: gameBaseInclude.club,
  court: {
    include: {
      club: true,
    },
  },
  participants: participantWithSportUser(levelProjectionUserSelect),
  outcomes: {
    include: {
      user: {
        select: levelProjectionUserSelect,
      },
    },
    orderBy: { position: 'asc' as const },
  },
  rounds: roundsWithMatches({
    include: {
      user: { select: levelProjectionUserSelect },
    },
  }),
  fixedTeams: {
    include: {
      players: {
        include: {
          user: {
            select: levelProjectionUserSelect,
          },
        },
      },
    },
    orderBy: { teamNumber: 'asc' as const },
  },
  gameCourts: gameCourtInclude,
} satisfies Prisma.GameInclude;

export type GameWithRoundsAndOutcomes = Prisma.GameGetPayload<{
  include: typeof gameWithRoundsAndOutcomes;
}>;

export type GameForRoundGeneration = Prisma.GameGetPayload<{
  include: typeof gameForRoundGeneration;
}>;

export type GameForLevelProjection = Prisma.GameGetPayload<{
  include: typeof gameForLevelProjection;
}>;
