/**
 * Game visibility and permission guards for the AI agent.
 *
 * Agent reads are **stricter than HTTP**: `GET /games/:id` serves a private game to
 * anyone holding its id (the direct-link model). The agent does not inherit that.
 * A game is visible to the agent iff:
 *
 *   - the principal is a platform admin, OR
 *   - it is not a system game (`cityId === null`), AND
 *   - it is not an unapproved EVENT (`eventApprovalStatus !== APPROVED`) unless the
 *     principal is its OWNER — both mirroring `GameReadService.getGameById`, AND
 *   - it is effectively public (`isPublic`, and its parent is public too — a public
 *     fixture under a private league season stays private), OR the principal has a
 *     roster row on the game or its parent with a status in
 *     `AGENT_VISIBLE_PARTICIPANT_STATUSES` (INVITED and IN_QUEUE included), OR
 *   - it is **league content**: a `LEAGUE_SEASON`, or any game whose parent is a
 *     `LEAGUE_SEASON` (fixtures). Product decision (Relic, 2026-09): leagues are for
 *     everyone — `GET /leagues/:id/*` serves season data to any authenticated user, and
 *     the agent matches that. Casual games keep the strict rule above.
 *
 * Anything not visible gets the exact 404 a missing id gets, so the agent can't be
 * used as a game-existence oracle. Template: `services/results/gameResultsAccess.ts`.
 * See `docs/plans/ai-agent.md` §0.2 and §3.
 */
import {
  EntityType,
  EventApprovalStatus,
  ParticipantRole,
  ParticipantStatus,
  type Prisma,
} from '@prisma/client';
import prisma from '../../../config/database';
import { ApiError } from '../../../utils/ApiError';
import {
  assertGamePermission,
  DEFAULT_GAME_PERMISSION_ROLES,
  type GamePermissionOptions,
} from '../../game/gamePermission';
import { authorizeInviteAsUser } from '../../invite/sendInviteAsUser.service';
import type { AgentPrincipal } from './agentPrincipal';

/** Roster statuses that make a private game (or its fixtures) visible to the agent. */
export const AGENT_VISIBLE_PARTICIPANT_STATUSES: ParticipantStatus[] = [
  ParticipantStatus.PLAYING,
  ParticipantStatus.NON_PLAYING,
  ParticipantStatus.IN_QUEUE,
  ParticipantStatus.GUEST,
  ParticipantStatus.INVITED,
];

type AgentAccessPrincipal = Pick<AgentPrincipal, 'userId' | 'isAdmin'>;

/** The one "not visible" answer. Identical to a nonexistent id. */
export function agentGameNotFound(): ApiError {
  return new ApiError(404, 'Game not found');
}

export type AgentGameVisibilityFacts = {
  /** `null` only for system games. */
  cityId: string | null;
  isPublic: boolean;
  entityType: EntityType;
  eventApprovalStatus: EventApprovalStatus | null;
  /** `null` when the game has no parent. */
  parentIsPublic: boolean | null;
  /** `null` when the game has no parent. */
  parentEntityType: EntityType | null;
  /** Principal holds `role = OWNER` on this game (any status), as `getGameById` checks. */
  viewerIsOwner: boolean;
  /** Principal has an `AGENT_VISIBLE_PARTICIPANT_STATUSES` row on the game or its parent. */
  viewerOnRoster: boolean;
};

/**
 * League content (season or a child of a season) is readable by every principal —
 * "leagues are for everyone" (see the file comment). Narrow on purpose: only the
 * `LEAGUE_SEASON` entity type and direct children of one.
 */
export function isAgentLeagueContent(
  facts: Pick<AgentGameVisibilityFacts, 'entityType' | 'parentEntityType'>,
): boolean {
  return (
    facts.entityType === EntityType.LEAGUE_SEASON ||
    facts.parentEntityType === EntityType.LEAGUE_SEASON
  );
}

/** Pure visibility decision; `assertAgentCanViewGame` loads the facts. */
export function canAgentViewGameRow(
  principal: Pick<AgentPrincipal, 'isAdmin'>,
  facts: AgentGameVisibilityFacts,
): boolean {
  if (principal.isAdmin) return true;
  if (facts.cityId === null) return false;
  if (
    facts.entityType === EntityType.EVENT &&
    facts.eventApprovalStatus !== EventApprovalStatus.APPROVED &&
    !facts.viewerIsOwner
  ) {
    return false;
  }
  if (isAgentLeagueContent(facts)) return true;
  const effectivelyPublic = facts.isPublic && facts.parentIsPublic !== false;
  return effectivelyPublic || facts.viewerOnRoster;
}

/**
 * Throws `agentGameNotFound()` unless the principal may see the game.
 * Covers GAME, TOURNAMENT, BAR, TRAINING, EVENT, LEAGUE_SEASON and fixtures.
 */
export async function assertAgentCanViewGame(
  principal: AgentAccessPrincipal,
  gameId: string,
): Promise<void> {
  if (!gameId) {
    throw agentGameNotFound();
  }
  const rosterWhere = {
    userId: principal.userId,
    status: { in: AGENT_VISIBLE_PARTICIPANT_STATUSES },
  };
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      cityId: true,
      isPublic: true,
      entityType: true,
      eventApprovalStatus: true,
      participants: {
        where: { userId: principal.userId },
        select: { role: true, status: true },
      },
      parent: {
        select: {
          isPublic: true,
          entityType: true,
          participants: { where: rosterWhere, select: { id: true }, take: 1 },
        },
      },
    },
  });
  if (!game) {
    throw agentGameNotFound();
  }

  const visible = canAgentViewGameRow(principal, {
    cityId: game.cityId,
    isPublic: game.isPublic,
    entityType: game.entityType,
    eventApprovalStatus: game.eventApprovalStatus,
    parentIsPublic: game.parent ? game.parent.isPublic : null,
    parentEntityType: game.parent ? game.parent.entityType : null,
    viewerIsOwner: game.participants.some((p) => p.role === ParticipantRole.OWNER),
    viewerOnRoster:
      game.participants.some((p) => AGENT_VISIBLE_PARTICIPANT_STATUSES.includes(p.status)) ||
      Boolean(game.parent?.participants.length),
  });
  if (!visible) {
    throw agentGameNotFound();
  }
}

/**
 * Prisma filter for agent list/search tools, consistent with `canAgentViewGameRow`.
 * AND it with the tool's own filters (city, dates, sport…).
 *
 * Deliberately not `availableGamesQuery.buildVisibilityOr` /
 * `eventDiscoveryVisibilityWhere`: the former counts any participant row (including
 * stale invite statuses) and lets league shells through for everyone; the latter hides
 * DECLINED events from their owner, which `getGameById` does not. System games need no clause here: `Game.cityId` is non-null in the
 * schema, so `canAgentViewGameRow`'s check is defensive only.
 */
export function agentVisibleGamesWhere(principal: AgentAccessPrincipal): Prisma.GameWhereInput {
  if (principal.isAdmin) return {};
  const onRoster: Prisma.GameParticipantListRelationFilter = {
    some: {
      userId: principal.userId,
      status: { in: AGENT_VISIBLE_PARTICIPANT_STATUSES },
    },
  };
  return {
    AND: [
      // Same rule as the pure check (and `getGameById`): unapproved EVENTs only for their owner.
      {
        OR: [
          { entityType: { not: EntityType.EVENT } },
          { eventApprovalStatus: EventApprovalStatus.APPROVED },
          { participants: { some: { userId: principal.userId, role: ParticipantRole.OWNER } } },
        ],
      },
      {
        OR: [
          { isPublic: true, OR: [{ parentId: null }, { parent: { isPublic: true } }] },
          { participants: onRoster },
          { parent: { participants: onRoster } },
          // League content is public to every principal (see `isAgentLeagueContent`).
          { entityType: EntityType.LEAGUE_SEASON },
          { parent: { entityType: EntityType.LEAGUE_SEASON } },
        ],
      },
    ],
  };
}

/**
 * League read guard for `get_league_season`, `get_league_standings`,
 * `get_league_schedule`.
 *
 * Product decision (Relic, 2026-09): **leagues are for everyone.** Season info,
 * standings, rounds / schedule, groups and the playoff bracket are readable by any
 * authenticated user, exactly like the HTTP `GET /leagues/:id/*` routes (which check
 * nothing beyond `authenticate`). So a private season is readable here too. What stays:
 * a missing id, or anything that is not a real `LEAGUE_SEASON`, is the not-found answer;
 * a system game (`cityId === null`) is hidden from non-admins, as in `getGameById`.
 * Writes are not affected: they still need season OWNER/ADMIN (`assertAgentGamePermission`).
 */
export async function assertAgentCanViewLeagueSeason(
  principal: AgentAccessPrincipal,
  seasonId: string,
): Promise<void> {
  if (!seasonId) {
    throw agentGameNotFound();
  }
  const game = await prisma.game.findUnique({
    where: { id: seasonId },
    select: { cityId: true, entityType: true, leagueSeason: { select: { id: true } } },
  });
  if (!game || game.entityType !== EntityType.LEAGUE_SEASON || !game.leagueSeason) {
    throw agentGameNotFound();
  }
  if (game.cityId === null && !principal.isAdmin) {
    throw agentGameNotFound();
  }
}

/**
 * Agent write/role guard: visibility first (hidden → 404, never 403), then the exact
 * HTTP `requireGamePermission` rules via `assertGamePermission`.
 */
export async function assertAgentGamePermission(
  principal: AgentAccessPrincipal,
  gameId: string,
  allowedRoles: ParticipantRole[] = DEFAULT_GAME_PERMISSION_ROLES,
  options: GamePermissionOptions = {},
): Promise<void> {
  await assertAgentCanViewGame(principal, gameId);
  await assertGamePermission(principal, gameId, allowedRoles, options);
}

/**
 * Agent invite guard: visibility, then the same `authorizeInviteAsUser` step that
 * `POST /invites` runs (`assertCanInviteToGame`). Roster-state rules (archived,
 * results started, EVENT) are enforced later by `sendInviteAsUser` itself.
 */
export async function assertAgentCanInviteToGame(
  principal: AgentAccessPrincipal,
  gameId: string,
): Promise<void> {
  await assertAgentCanViewGame(principal, gameId);
  await authorizeInviteAsUser(principal, gameId);
}
