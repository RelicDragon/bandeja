/**
 * Whitelist projection for `GET /api/games/:id` (`GameReadService.getGameById`).
 *
 * The endpoint sits on `optionalAuth` and used to run a top-level Prisma
 * `include`, which loads **every** `Game` scalar — so PRD 348's free-text
 * `Game.paymentHint` (an IBAN, a Revolut handle, a phone number) was returned to
 * a caller holding nothing but a game id and no `Authorization` header at all.
 * The nested `club: true` / `court: { include: { club: true } }` relations shipped
 * `Club.integrationConfig` and `Club.ptMeta` the same way, and every nested user
 * carried `bio` / `verbalStatus` / `weeklyAvailability` / `socialLevel`.
 *
 * The house pattern is `availableGamesCard.projection.ts` and
 * `../results/gameResults.projection.ts`: an explicit `select` plus a
 * machine-readable forbidden list that a test asserts against. This is that
 * shape for the game-detail surface.
 *
 * Two audiences:
 *
 * - **Signed-in viewer.** Gets the payload the app has always read, including
 *   the nested club `integrationConfig` the linked-bookings section parses and
 *   the roster bios the player card renders.
 * - **Guest.** Same game shape, minus every field on the forbidden lists below.
 *
 * `paymentHint` is in **neither** select. It is read by its own query
 * ({@link GAME_PAYMENT_HINT_SELECT}) only after {@link isEntitledToGamePaymentHint}
 * has answered against the loaded roster — the same roster / organizer /
 * platform-admin test `GET /games/:id/cost` applies
 * (`gameCost/costSharePermissions.ts` `canViewCostShares`).
 *
 * Adding a scalar here is a deliberate act: a new `Game` column does **not**
 * reach these endpoints until someone writes it down.
 */
import type { Prisma } from '@prisma/client';
import { GAME_INVITE_OUTCOME_INCLUDE } from '../../utils/gameInviteOutcomeInclude';
import {
  USER_SELECT_WITH_SPORT_PROFILES,
  USER_SPORT_PROFILE_SELECT,
} from '../../utils/constants';
import { MAIN_PHOTO_RELATION_SELECT } from './gamePrismaIncludes';

/* ------------------------------------------------------------------ *
 * Forbidden lists — the machine-readable half of the contract.
 * ------------------------------------------------------------------ */

/**
 * `Game` scalars that must never reach a caller without cost-ledger entitlement.
 *
 * `paymentMethods` is the structured form of the same secret — a phone number
 * for Bizum or IPS Prenesi, an IBAN, a Pix key — so it is gated identically.
 */
export const GAME_DETAIL_ENTITLED_GAME_KEYS = ['paymentHint', 'paymentMethods'] as const;

/**
 * Fields `getGameById` computes **for the viewer who asked**, not for the game.
 *
 * They are correct on `GET /api/games/:id`, where the caller is the viewer, and
 * meaningless-to-wrong on a broadcast, where one payload reaches a whole room:
 * `userNote` is the asking user's private note, `isClubFavorite` their own
 * favourite flag.
 */
export const GAME_DETAIL_VIEWER_SCOPED_KEYS = ['userNote', 'isClubFavorite'] as const;

/** `Club` fields that must never reach an unauthenticated caller. */
export const GAME_DETAIL_GUEST_FORBIDDEN_CLUB_KEYS = [
  'integrationConfig',
  'ptMeta',
] as const;

/** User fields that must never reach an unauthenticated caller. */
export const GAME_DETAIL_GUEST_FORBIDDEN_USER_KEYS = [
  'bio',
  'verbalStatus',
  'weeklyAvailability',
  'availabilityBucketBoundaries',
  'socialLevel',
  'phone',
  'email',
  'telegramId',
  'wallet',
] as const;

/* ------------------------------------------------------------------ *
 * Scalars
 * ------------------------------------------------------------------ */

/**
 * Every `Game` scalar the detail payload is allowed to carry.
 *
 * `paymentHint` is deliberately absent — it is merged in by
 * {@link getGameDetailSelect} only for entitled viewers.
 */
export const GAME_DETAIL_GAME_SCALAR_SELECT = {
  id: true,
  entityType: true,
  sport: true,
  gameType: true,
  name: true,
  description: true,
  avatar: true,
  originalAvatar: true,
  clubId: true,
  courtId: true,
  cityId: true,
  startTime: true,
  endTime: true,
  maxParticipants: true,
  playersPerMatch: true,
  minParticipants: true,
  minLevel: true,
  maxLevel: true,
  isPublic: true,
  affectsRating: true,
  anyoneCanInvite: true,
  resultsByAnyone: true,
  allowDirectJoin: true,
  hasBookedCourt: true,
  bookingStatus: true,
  afterGameGoToBar: true,
  hasFixedTeams: true,
  allowUserInMultipleTeams: true,
  genderTeams: true,
  teamsReady: true,
  participantsReady: true,
  status: true,
  resultsStatus: true,
  resultsMeta: true,
  fixedNumberOfSets: true,
  maxTotalPointsPerSet: true,
  matchTimedCapMinutes: true,
  matchTimerEnabled: true,
  maxPointsPerTeam: true,
  winnerOfGame: true,
  winnerOfMatch: true,
  matchGenerationType: true,
  pointsPerWin: true,
  pointsPerLoose: true,
  pointsPerTie: true,
  ballsInGames: true,
  scoringPreset: true,
  scoringMode: true,
  deucesBeforeGoldenPoint: true,
  mediaUrls: true,
  photosCount: true,
  forbidOthersPhotosView: true,
  mainPhotoId: true,
  resultsSentToTelegram: true,
  telegramResultsSummary: true,
  resultsSummaryText: true,
  resultsSummaryGeneratedAt: true,
  resultsArtifactsReadyAt: true,
  resultsArtifactsVersion: true,
  parentId: true,
  trainerId: true,
  leagueRoundId: true,
  leagueGroupId: true,
  timeIsSet: true,
  finishedDate: true,
  priceTotal: true,
  priceType: true,
  priceCurrency: true,
  timeOverride: true,
  metadata: true,
  lastMessagePreview: true,
  eventKind: true,
  eventApprovalStatus: true,
  venueText: true,
  externalUrl: true,
  /* PRD 345–357 columns. */
  seriesId: true,
  seriesOccurrenceDate: true,
  autoFillFromQueue: true,
  showOnLiveRail: true,
  lastSeatOpenedAt: true,
  costPayerId: true,
  costFrozenAt: true,
  weatherAlertState: true,
  /** PRD 360 — "Novices welcome" toggle and details-header tag. */
  suitableForNovices: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.GameSelect;

/* ------------------------------------------------------------------ *
 * Users
 * ------------------------------------------------------------------ */

/**
 * Guest twin of `USER_SELECT_WITH_SPORT_PROFILES`.
 *
 * Deliberately spelled out rather than derived by deletion: a new personal field
 * added to `USER_SELECT_FIELDS` must not silently become guest-readable.
 */
export const GAME_DETAIL_GUEST_USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  avatar: true,
  primarySport: true,
  gender: true,
  genderIsSet: true,
  approvedLevel: true,
  isTrainer: true,
  isPremium: true,
  showPremiumStatus: true,
  trainerRating: true,
  trainerReviewCount: true,
  sportsEnabled: true,
  sportProfiles: {
    select: USER_SPORT_PROFILE_SELECT,
  },
} as const satisfies Prisma.UserSelect;

/** `USER_SELECT_FIELDS` twin for guests (invite outcomes carry no sport profiles). */
const GAME_DETAIL_GUEST_INVITE_USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  avatar: true,
  primarySport: true,
  gender: true,
  genderIsSet: true,
  approvedLevel: true,
  isTrainer: true,
  isPremium: true,
  showPremiumStatus: true,
  trainerRating: true,
  trainerReviewCount: true,
} as const satisfies Prisma.UserSelect;

/* ------------------------------------------------------------------ *
 * Clubs / courts
 * ------------------------------------------------------------------ */

const CLUB_DETAIL_SCALAR_SELECT = {
  id: true,
  name: true,
  normalizedName: true,
  description: true,
  avatar: true,
  originalAvatar: true,
  photos: true,
  address: true,
  cityId: true,
  phone: true,
  email: true,
  website: true,
  latitude: true,
  longitude: true,
  openingTime: true,
  closingTime: true,
  amenities: true,
  isActive: true,
  isBar: true,
  isForPlaying: true,
  integrationType: true,
  courtsNumber: true,
  sports: true,
  clubRating: true,
  clubReviewCount: true,
  defaultSlotMinutes: true,
  cancellationNoticeHours: true,
  policyText: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.ClubSelect;

const COURT_DETAIL_SCALAR_SELECT = {
  id: true,
  name: true,
  clubId: true,
  sport: true,
  courtType: true,
  isIndoor: true,
  surfaceType: true,
  pricePerHour: true,
  externalCourtId: true,
  integrationCourtName: true,
  webCameraUrl: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.CourtSelect;

/**
 * `Club.integrationConfig` is what `clubHasBookingIntegration` /
 * `clubToBooktimeRow` parse on `GameLinkedBookingsSection`, so a signed-in
 * viewer keeps it — they can read the same blob from `GET /clubs/:id` anyway.
 * A guest gets neither.
 */
function clubSelect(viewerIsAuthenticated: boolean): Prisma.ClubSelect {
  const base: Prisma.ClubSelect = {
    ...CLUB_DETAIL_SCALAR_SELECT,
    city: { select: { name: true, timezone: true } },
  };
  return viewerIsAuthenticated ? { ...base, integrationConfig: true } : base;
}

const leagueSeasonSelect = {
  select: {
    id: true,
    leagueId: true,
    orderIndex: true,
    sport: true,
    movePlayersRule: true,
    createdAt: true,
    updatedAt: true,
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

/* ------------------------------------------------------------------ *
 * Select builder
 * ------------------------------------------------------------------ */

export type GameDetailSelectOptions = {
  /** `true` when the request carried a valid token. */
  viewerIsAuthenticated: boolean;
};

/**
 * The entitled read, deliberately kept out of {@link getGameDetailSelect}.
 *
 * `paymentHint` is fetched by its own `findUnique` **after**
 * {@link isEntitledToGamePaymentHint} has answered against the loaded roster,
 * so the value never enters the process for a caller who may not have it. One
 * extra primary-key lookup of a `VarChar(120)`, and only for entitled viewers.
 */
export const GAME_PAYMENT_HINT_SELECT = {
  paymentHint: true,
  paymentMethods: true,
} as const satisfies Prisma.GameSelect;

function detailRelationSelect(viewerIsAuthenticated: boolean): Prisma.GameSelect {
  const userSelect: Prisma.UserSelect = viewerIsAuthenticated
    ? USER_SELECT_WITH_SPORT_PROFILES
    : GAME_DETAIL_GUEST_USER_SELECT;
  const inviteOutcomeInclude: Prisma.GameInviteOutcomeInclude = viewerIsAuthenticated
    ? GAME_INVITE_OUTCOME_INCLUDE
    : {
        user: { select: GAME_DETAIL_GUEST_INVITE_USER_SELECT },
        invitedByUser: { select: GAME_DETAIL_GUEST_INVITE_USER_SELECT },
      };
  const club = clubSelect(viewerIsAuthenticated);

  return {
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
      select: {
        ...club,
        courts: true,
      },
    },
    court: {
      select: {
        ...COURT_DETAIL_SCALAR_SELECT,
        club: { select: club },
      },
    },
    /**
     * `include`, not `select`: every `GameParticipant` scalar is roster
     * bookkeeping the detail screen already reads (`activeMatchId` for the live
     * board, `inviteUserTeamId` for fixed-team pairing, the PRD 346 attendance
     * quartet). None of them is on a forbidden list — the sensitive half of a
     * participant is the nested `user`, which is projected above.
     */
    participants: {
      include: {
        user: { select: userSelect },
        invitedByUser: { select: userSelect },
      },
    },
    inviteOutcomes: {
      include: inviteOutcomeInclude,
    },
    fixedTeams: {
      include: {
        players: {
          include: {
            user: { select: userSelect },
          },
        },
      },
      orderBy: { teamNumber: 'asc' },
    },
    leagueSeason: leagueSeasonSelect,
    leagueGroup: {
      select: { id: true, name: true, color: true },
    },
    leagueRound: {
      select: {
        id: true,
        orderIndex: true,
        roundType: true,
        playoffFormat: true,
        bracketScope: true,
        entrantCount: true,
        bracketSize: true,
      },
    },
    bracketSlot: {
      select: { slotKind: true, roundIndex: true },
    },
    mainPhoto: MAIN_PHOTO_RELATION_SELECT,
    eventHeroes: {
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        originalUrl: true,
        thumbnailUrl: true,
        sortOrder: true,
      },
    },
    resultsArtifactJob: {
      select: {
        status: true,
        summaryStatus: true,
        photoStatus: true,
        photoGenerationsUsed: true,
      },
    },
    externalBookings: {
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        externalBookingId: true,
        externalBookingProvider: true,
        courtId: true,
        bookingStart: true,
        bookingEnd: true,
      },
    },
    outcomes: {
      include: {
        user: { select: userSelect },
      },
      orderBy: { position: 'asc' },
    },
    rounds: {
      orderBy: { roundNumber: 'asc' },
      include: {
        matches: {
          orderBy: { matchNumber: 'asc' },
          include: {
            teams: {
              include: {
                players: {
                  include: {
                    user: { select: userSelect },
                  },
                },
              },
            },
            sets: {
              orderBy: { setNumber: 'asc' },
            },
          },
        },
      },
    },
    gameCourts: {
      orderBy: { order: 'asc' },
      include: {
        court: {
          select: {
            ...COURT_DETAIL_SCALAR_SELECT,
            club: { select: { id: true, name: true, address: true } },
          },
        },
      },
    },
    /**
     * The parent is a league season / tournament `Game` row, so it carries its
     * own `paymentHint`. It is never merged in here — the ledger for a parent is
     * read through the parent's own endpoints.
     */
    parent: {
      select: {
        ...GAME_DETAIL_GAME_SCALAR_SELECT,
        participants: {
          include: {
            user: { select: userSelect },
          },
        },
        leagueSeason: leagueSeasonSelect,
      },
    },
  };
}

/**
 * Prisma `select` for the game-detail payload — never an `include`, and never
 * carrying `paymentHint` (see {@link GAME_PAYMENT_HINT_SELECT}).
 */
export function getGameDetailSelect(options: GameDetailSelectOptions): Prisma.GameSelect {
  return {
    ...GAME_DETAIL_GAME_SCALAR_SELECT,
    ...detailRelationSelect(options.viewerIsAuthenticated),
  };
}

/**
 * `GET /api/games` — the filtered list, also on `optionalAuth`.
 *
 * Byte-identical leak to the detail route: a top-level `include` shipped every
 * `Game` scalar for **every** row a filter matched. The list has no surface
 * that reads `paymentHint`, so there is no entitled variant here — it is simply
 * never selected.
 *
 * Same relations the list always had: no rounds, no outcomes, no per-game
 * courts and no external bookings.
 */
export function getGameListSelect(options: GameDetailSelectOptions): Prisma.GameSelect {
  const {
    rounds: _rounds,
    outcomes: _outcomes,
    gameCourts: _gameCourts,
    externalBookings: _externalBookings,
    ...listRelations
  } = detailRelationSelect(options.viewerIsAuthenticated);
  void _rounds;
  void _outcomes;
  void _gameCourts;
  void _externalBookings;
  return {
    ...GAME_DETAIL_GAME_SCALAR_SELECT,
    ...listRelations,
  };
}

/* ------------------------------------------------------------------ *
 * Entitlement
 * ------------------------------------------------------------------ */

export type PaymentHintViewer = {
  userId?: string | null;
  isPlatformAdmin?: boolean;
};

/**
 * Who may see `Game.paymentHint` on the detail payload.
 *
 * Mirrors `canViewCostShares` (`gameCost/costSharePermissions.ts`): platform
 * staff, the organizers and anyone holding a roster row in any
 * `ParticipantStatus`. Share holders are always roster members — shares are
 * materialised from the roster — so no extra branch is needed.
 *
 * Fails closed: no viewer id, no hint.
 */
export function isEntitledToGamePaymentHint(
  roster: ReadonlyArray<{ userId: string | null }>,
  viewer: PaymentHintViewer,
): boolean {
  if (viewer.isPlatformAdmin === true) return true;
  const userId = viewer.userId;
  if (!userId) return false;
  return roster.some((p) => p.userId === userId);
}

/* ------------------------------------------------------------------ *
 * Broadcast projection
 * ------------------------------------------------------------------ */

/**
 * Keys a `game-updated` broadcast must never carry.
 *
 * The socket payload has **one** audience and many entitlements: the
 * `game-${id}` room holds roster members, invited users, watchers of a public
 * game and — via `MessageService.validateGameAccess` — every participant of a
 * league **season** for any of its fixtures. A room member is therefore not
 * necessarily entitled to what `GET /api/games/:id` would hand the actor who
 * triggered the update, and there is no per-socket entitlement check on the
 * broadcast path.
 *
 * So the payload is projected for the *least*-entitled member of the room:
 * entitlement-gated scalars ({@link GAME_DETAIL_ENTITLED_GAME_KEYS}) and
 * viewer-scoped fields ({@link GAME_DETAIL_VIEWER_SCOPED_KEYS}) are dropped.
 * Entitled clients read them from `GET /api/games/:id`, where the entitlement
 * is evaluated per caller, and keep the value they already hold in the
 * meantime — a socket payload that omits a key means "not transmitted", never
 * "cleared".
 */
export const GAME_BROADCAST_STRIPPED_KEYS = [
  ...GAME_DETAIL_ENTITLED_GAME_KEYS,
  ...GAME_DETAIL_VIEWER_SCOPED_KEYS,
] as const;

const BROADCAST_STRIPPED_KEY_SET: ReadonlySet<string> = new Set(GAME_BROADCAST_STRIPPED_KEYS);

/**
 * Shallow copy of a game-detail payload with every
 * {@link GAME_BROADCAST_STRIPPED_KEYS} key removed.
 *
 * Every `game-updated` emit goes through this — including the call sites that
 * hand `SocketService.emitGameUpdate` a game they already loaded for an
 * authorised user (`update.service.ts`, `gamePhoto.events.ts`,
 * `gameResultsArtifact.events.ts`, `game.controller.ts`).
 */
export function projectGameForBroadcast<T extends object>(game: T): T {
  const projected: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(game)) {
    if (BROADCAST_STRIPPED_KEY_SET.has(key)) continue;
    projected[key] = value;
  }
  return projected as unknown as T;
}

/* ------------------------------------------------------------------ *
 * Contract asserter
 * ------------------------------------------------------------------ */

export type GameDetailContractIssue = {
  path: string;
  reason: string;
};

function collectClubIssues(
  club: unknown,
  path: string,
  issues: GameDetailContractIssue[],
): void {
  if (!club || typeof club !== 'object') return;
  const row = club as Record<string, unknown>;
  for (const key of GAME_DETAIL_GUEST_FORBIDDEN_CLUB_KEYS) {
    if (key in row) {
      issues.push({ path: `${path}.${key}`, reason: `${key} must not reach a guest` });
    }
  }
}

function collectUserIssues(
  user: unknown,
  path: string,
  issues: GameDetailContractIssue[],
): void {
  if (!user || typeof user !== 'object') return;
  const row = user as Record<string, unknown>;
  for (const key of GAME_DETAIL_GUEST_FORBIDDEN_USER_KEYS) {
    if (key in row) {
      issues.push({ path: `${path}.${key}`, reason: `${key} must not reach a guest` });
    }
  }
}

/**
 * Contract check for one game-detail payload as served to an **unauthenticated**
 * caller. Cheap enough to call from an integration test on every fixture.
 */
export function collectGameDetailGuestContractIssues(
  payload: unknown,
): GameDetailContractIssue[] {
  const issues: GameDetailContractIssue[] = [];
  if (!payload || typeof payload !== 'object') {
    issues.push({ path: '', reason: 'not an object' });
    return issues;
  }
  const game = payload as Record<string, unknown>;

  for (const key of GAME_DETAIL_ENTITLED_GAME_KEYS) {
    if (key in game) {
      issues.push({ path: key, reason: `${key} must not reach an unentitled viewer` });
    }
  }

  collectClubIssues(game.club, 'club', issues);
  collectClubIssues((game.court as Record<string, unknown> | null)?.club, 'court.club', issues);

  const participants = Array.isArray(game.participants) ? game.participants : [];
  participants.forEach((participant, index) => {
    const row = (participant ?? {}) as Record<string, unknown>;
    collectUserIssues(row.user, `participants[${index}].user`, issues);
    collectUserIssues(row.invitedByUser, `participants[${index}].invitedByUser`, issues);
  });

  const outcomes = Array.isArray(game.outcomes) ? game.outcomes : [];
  outcomes.forEach((outcome, index) => {
    collectUserIssues(
      (outcome as Record<string, unknown> | null)?.user,
      `outcomes[${index}].user`,
      issues,
    );
  });

  const parent = game.parent as Record<string, unknown> | null | undefined;
  if (parent) {
    for (const key of GAME_DETAIL_ENTITLED_GAME_KEYS) {
      if (key in parent) {
        issues.push({ path: `parent.${key}`, reason: `${key} must not reach any detail payload` });
      }
    }
  }

  return issues;
}

export function assertGameDetailGuestContract(payload: unknown): void {
  const issues = collectGameDetailGuestContractIssues(payload);
  if (issues.length > 0) {
    const detail = issues.map((issue) => `${issue.path}: ${issue.reason}`).join('; ');
    throw new Error(`Game detail guest contract failed: ${detail}`);
  }
}
