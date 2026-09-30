/**
 * Admin agent tools (phase 5a, docs/plans/ai-agent.md §5 v3): global admins
 * (`User.isAdmin`) manage players and games by prompt.
 *
 *   - Every tool is `scope: 'admin'`: the registry leaves it out of non-admins' tool list and
 *     `executeTool` answers `unknown_tool` for a forged call. Each handler ALSO checks
 *     `principal.isAdmin` (belt and braces), and so does `confirm.authorize` against the
 *     principal re-loaded at confirm time (an admin demoted in between cannot confirm).
 *   - Writes go through the usual confirmation card + audit row (`proposeAgentAction`).
 *   - Every mutation reuses the service behind an existing admin HTTP route:
 *       admin_update_user_flags → `AdminUsersService.updateUser`  (PUT  /admin/users/:userId)
 *       admin_update_game       → `GameUpdateService.updateGame`   (PUT  /games/:id, admin bypass)
 *       admin_approve_event /
 *       admin_decline_event     → `EventApprovalService.decide`   (POST /games/:id/event-approval, requireAdmin)
 *     Reads: `AdminUsersService.getAllUsers` / `getUsersByIds` (GET /admin/users).
 *   - Never: deleting users or games, impersonation, passwords, payments / wallet / coins,
 *     private chat messages.
 * Target users are `targetUserId` (never `userId`): the actor is always the principal.
 */
import { EntityType, EventApprovalStatus, ParticipantRole, ParticipantStatus } from '@prisma/client';
import { z } from 'zod/v4';
import type { AgentActionPreview, AgentActionPreviewLine } from '@bandeja/shared/agentContract';
import prisma from '../../../config/database';
import { ApiError } from '../../../utils/ApiError';
import { AdminUsersService } from '../../admin/users.service';
import { EventApprovalService } from '../../game/eventApproval.service';
import { GameUpdateService } from '../../game/update.service';
import { GameCourtService } from '../../gameCourt/gameCourt.service';
import type { AgentPrincipal } from '../access/agentPrincipal';
import { assertAgentGamePermission } from '../access/agentGameAccess';
import { proposeAgentAction } from '../agentActionPropose';
import { isValidTimeZone } from '../agentContext.service';
import {
  agentAdminUserEntity,
  toAgentAdminUserDetail,
  toAgentAdminUserSummary,
  type AgentAdminUserSource,
} from '../dto/adminUser.dto';
import { agentGameEntity, agentGameSummarySelect, agentGameTitle, toAgentGameSummary } from '../dto/game.dto';
import { agentUserDisplayName } from '../dto/user.dto';
import { agentAdminT } from '../i18n/agentAdminI18n';
import { agentT, formatAgentDateTime } from '../i18n/agentI18n';
import { defineTool, parseAgentDate } from './registry';
import { clip, gameEntityFor, gameTimezone, line, loadGameForWrite, parsePlan, when, type GameWriteRow } from './writeHelpers';

const ID = z.string().min(1).max(64);

/** Belt and braces behind the registry's scope filter. */
export function assertAgentAdmin(principal: Pick<AgentPrincipal, 'isAdmin'>): void {
  if (!principal.isAdmin) throw new ApiError(403, 'Admin only');
}

// --- admin_find_users ------------------------------------------------------------------------

const FIND_USERS_MAX = 20;

const findUsersInput = z
  .object({
    query: z.string().trim().min(2).max(100).describe('Part of a name, email or phone number'),
    limit: z.number().int().min(1).max(FIND_USERS_MAX).optional(),
  })
  .strict();

export const adminFindUsersTool = defineTool({
  name: 'admin_find_users',
  description:
    'Admin only. Find any user (active or not) by part of their name, email or phone. Returns id, name, email, home city, account flags and sign-up date, newest first.',
  kind: 'read',
  scope: 'admin',
  input: findUsersInput,
  label: (_args, locale) => agentAdminT(locale, 'label.adminFindUsers'),
  handler: async (ctx, args) => {
    assertAgentAdmin(ctx.principal);
    // Same search as the Admin → Users list (`GET /admin/users?search=`).
    const result = await AdminUsersService.getAllUsers({ search: args.query });
    const users = (result.users as AgentAdminUserSource[]).slice(0, args.limit ?? 10);
    return {
      data: { total: result.total, users: users.map(toAgentAdminUserSummary) },
      summary: agentAdminT(ctx.locale, 'summary.users', { count: result.total }),
      entities: users.map(agentAdminUserEntity),
    };
  },
});

// --- admin_get_user --------------------------------------------------------------------------

async function loadAdminUser(targetUserId: string): Promise<AgentAdminUserSource> {
  const [row] = (await AdminUsersService.getUsersByIds([targetUserId])) as AgentAdminUserSource[];
  if (!row) throw new ApiError(404, 'User not found');
  return row;
}

export const adminGetUserTool = defineTool({
  name: 'admin_get_user',
  description:
    'Admin only. One user by id (from admin_find_users): name, email, home city, account flags (active, admin, trainer, can create tournaments/leagues, max players per game), sports and levels, linked sign-in methods.',
  kind: 'read',
  scope: 'admin',
  input: z.object({ targetUserId: ID }).strict(),
  label: (_args, locale) => agentAdminT(locale, 'label.adminGetUser'),
  handler: async (ctx, args) => {
    assertAgentAdmin(ctx.principal);
    const row = await loadAdminUser(args.targetUserId);
    return {
      data: { user: toAgentAdminUserDetail(row) },
      summary: agentUserDisplayName(row),
      entities: [agentAdminUserEntity(row)],
    };
  },
});

// --- admin_update_user_flags -----------------------------------------------------------------

/** Exactly the flag fields `PUT /admin/users/:userId` accepts (profile fields stay in the panel). */
const userFlagsPatchSchema = z
  .object({
    isActive: z.boolean().optional().describe('false = deactivate the account (they can no longer use the app)'),
    isAdmin: z.boolean().optional().describe('Platform admin. Grant only when explicitly asked.'),
    isTrainer: z.boolean().optional(),
    canCreateTournament: z.boolean().optional(),
    canCreateLeague: z.boolean().optional(),
    maxParticipantsInGame: z.number().int().min(2).max(999).optional(),
  })
  .strict();

type UserFlagsPatch = z.infer<typeof userFlagsPatchSchema>;
type UserFlagKey = keyof UserFlagsPatch;

const FLAG_LABEL_KEYS = {
  isActive: 'field.isActive',
  isAdmin: 'field.isAdmin',
  isTrainer: 'field.isTrainer',
  canCreateTournament: 'field.canCreateTournament',
  canCreateLeague: 'field.canCreateLeague',
  maxParticipantsInGame: 'field.maxParticipantsInGame',
} as const satisfies Record<UserFlagKey, Parameters<typeof agentAdminT>[1]>;

const updateUserFlagsInput = z
  .object({
    targetUserId: ID,
    patch: userFlagsPatchSchema.refine((patch) => Object.keys(patch).length > 0, 'patch must change at least one flag'),
  })
  .strict();

const userFlagsPlanSchema = z.object({ targetUserId: z.string(), patch: userFlagsPatchSchema }).strict();

/** An admin must never lock themselves out: no self-demotion, no self-deactivation. */
function assertNotSelfLockout(principal: AgentPrincipal, targetUserId: string, patch: UserFlagsPatch): void {
  if (targetUserId !== principal.userId) return;
  if (patch.isAdmin === false) throw new ApiError(400, 'You cannot remove your own admin rights');
  if (patch.isActive === false) throw new ApiError(400, 'You cannot deactivate your own account');
}

export const adminUpdateUserFlagsTool = defineTool({
  name: 'admin_update_user_flags',
  description:
    'Admin only. Prepare a change of account flags of a user (id from admin_find_users): active, platform admin, trainer, can create tournaments, can create leagues, max players per game. Creates a confirmation card; nothing changes until the admin confirms. Never grant admin unless the admin explicitly asked in their own message.',
  kind: 'write',
  riskTier: 'critical',
  scope: 'admin',
  promptHint: '(platform admin) change account flags of a user: active, admin, trainer, can create tournaments/leagues, max players per game',
  input: updateUserFlagsInput,
  label: (_args, locale) => agentAdminT(locale, 'label.adminUpdateUserFlags'),
  handler: async (ctx, args) => {
    const { principal, locale } = ctx;
    assertAgentAdmin(principal);
    assertNotSelfLockout(principal, args.targetUserId, args.patch);
    const target = await loadAdminUser(args.targetUserId);
    const name = agentUserDisplayName(target);
    const current: Record<UserFlagKey, boolean | number> = {
      isActive: target.isActive,
      isAdmin: target.isAdmin,
      isTrainer: target.isTrainer,
      canCreateTournament: target.canCreateTournament,
      canCreateLeague: target.canCreateLeague,
      maxParticipantsInGame: target.maxParticipantsInGame,
    };
    const patch: UserFlagsPatch = {};
    const lines: AgentActionPreviewLine[] = [];
    const warnings: string[] = [];
    const show = (value: boolean | number) =>
      typeof value === 'number' ? String(value) : agentT(locale, value ? 'value.yes' : 'value.no');
    for (const key of Object.keys(FLAG_LABEL_KEYS) as UserFlagKey[]) {
      const next = args.patch[key];
      if (next === undefined || next === current[key]) continue;
      (patch as Record<UserFlagKey, boolean | number>)[key] = next;
      lines.push(line(agentAdminT(locale, FLAG_LABEL_KEYS[key]), show(current[key]), show(next)));
    }
    if (Object.keys(patch).length === 0) throw new ApiError(400, 'Nothing to change: the user already has these flags');
    if (patch.isAdmin === true) warnings.push(agentAdminT(locale, 'warn.grantAdmin', { name }));
    if (patch.isAdmin === false) warnings.push(agentAdminT(locale, 'warn.revokeAdmin', { name }));
    if (patch.isActive === false) warnings.push(agentAdminT(locale, 'warn.deactivate', { name }));
    const preview: AgentActionPreview = {
      title: agentAdminT(locale, 'preview.userFlags.title', { name: clip(name, 60) ?? name }),
      lines,
      warnings,
    };
    const plan: z.infer<typeof userFlagsPlanSchema> = { targetUserId: target.id, patch };
    return proposeAgentAction(ctx, { toolName: 'admin_update_user_flags', input: args, plan, preview });
  },
  confirm: {
    authorize: async (principal, rawPlan) => {
      const plan = parsePlan(userFlagsPlanSchema, rawPlan);
      assertAgentAdmin(principal);
      assertNotSelfLockout(principal, plan.targetUserId, plan.patch);
    },
    execute: async (ctx, rawPlan) => {
      const plan = parsePlan(userFlagsPlanSchema, rawPlan);
      // The `PUT /admin/users/:userId` body with the flag fields only.
      const updated = (await AdminUsersService.updateUser(plan.targetUserId, { ...plan.patch })) as AgentAdminUserSource | null;
      if (!updated) throw new ApiError(404, 'User not found');
      return {
        message: agentAdminT(ctx.locale, 'result.userUpdated'),
        entities: [agentAdminUserEntity(updated)],
        modelData: { targetUserId: plan.targetUserId, flags: toAgentAdminUserSummary(updated).flags },
      };
    },
  },
});

// --- admin_update_game -----------------------------------------------------------------------

const ADMIN_EDIT_ROLES: ParticipantRole[] = [ParticipantRole.OWNER, ParticipantRole.ADMIN];
/** Same guard as `update_game`: not archived, results not started (admins pass the role check). */
const ADMIN_EDIT_OPTIONS = { requireRosterMutable: true } as const;
/** League shells and fixtures have their own flows (league tools / the app). */
const ADMIN_UPDATABLE_ENTITY_TYPES: EntityType[] = [
  EntityType.GAME,
  EntityType.TOURNAMENT,
  EntityType.TRAINING,
  EntityType.BAR,
  EntityType.EVENT,
];

const adminGamePatchSchema = z
  .object({
    clubId: ID.optional().describe('Club id (search_clubs with a cityId); a club in another city moves the game there'),
    courtId: ID.nullable().optional().describe('Court id from get_club, or null for no court'),
    startTime: z.string().max(40).optional().describe('YYYY-MM-DDTHH:mm in the (new) club city time, or ISO'),
    endTime: z.string().max(40).optional().describe('When only startTime is given the duration is kept'),
    name: z.string().trim().max(100).nullable().optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    maxParticipants: z.number().int().min(2).max(64).optional(),
    isPublic: z.boolean().optional(),
    allowDirectJoin: z.boolean().optional(),
  })
  .strict();

const adminUpdateGameInput = z
  .object({
    gameId: ID,
    patch: adminGamePatchSchema.refine((patch) => Object.keys(patch).length > 0, 'patch must change at least one field'),
  })
  .strict();

const adminGamePlanSchema = z
  .object({ gameId: z.string(), body: z.record(z.string(), z.unknown()), syncGameCourts: z.boolean() })
  .strict();

function assertAdminUpdateSupported(game: Pick<GameWriteRow, 'entityType' | '_count'>, body: Record<string, unknown>): void {
  if (!ADMIN_UPDATABLE_ENTITY_TYPES.includes(game.entityType)) {
    throw new ApiError(400, 'League seasons and fixtures are edited with the league tools or in the app');
  }
  if (['startTime', 'endTime', 'clubId', 'courtId'].some((key) => key in body) && game._count.externalBookings > 0) {
    throw new ApiError(400, 'This game is linked to court bookings; change its time and place in the app');
  }
  if (('clubId' in body || 'courtId' in body) && game._count.gameCourts > 1) {
    throw new ApiError(400, 'This game uses several courts; change the courts in the app');
  }
}

async function authorizeAdminGameEdit(principal: AgentPrincipal, gameId: string): Promise<void> {
  assertAgentAdmin(principal);
  await assertAgentGamePermission(principal, gameId, ADMIN_EDIT_ROLES, ADMIN_EDIT_OPTIONS);
}

export const adminUpdateGameTool = defineTool({
  name: 'admin_update_game',
  description:
    'Admin only. Prepare a change to ANY game, tournament, training, bar meetup or event (not league seasons/fixtures): club (a club in another city moves the game to that city), court, time, name, description, max players, public/private, direct join. Creates a confirmation card; nothing changes until the admin confirms.',
  kind: 'write',
  riskTier: 'critical',
  scope: 'admin',
  promptHint: '(platform admin) change any game, tournament, training, bar meetup or event (not league seasons/fixtures)',
  input: adminUpdateGameInput,
  label: (_args, locale) => agentAdminT(locale, 'label.adminUpdateGame'),
  handler: async (ctx, args) => {
    const { principal, locale } = ctx;
    await authorizeAdminGameEdit(principal, args.gameId);
    const game = await loadGameForWrite(args.gameId);
    const patch = args.patch;
    const body: Record<string, unknown> = {};
    const lines: AgentActionPreviewLine[] = [];
    const warnings: string[] = [];

    let targetClub: { id: string; cityId: string | null; timezone: string | null } | null = game.club
      ? { id: game.club.id, cityId: game.cityId, timezone: game.city?.timezone ?? null }
      : null;
    if (patch.clubId !== undefined && patch.clubId !== game.clubId) {
      const club = await prisma.club.findUnique({
        where: { id: patch.clubId },
        select: { id: true, name: true, isActive: true, cityId: true, city: { select: { name: true, timezone: true } } },
      });
      if (!club || !club.isActive) throw new ApiError(404, 'Club not found');
      targetClub = { id: club.id, cityId: club.cityId, timezone: club.city.timezone };
      body.clubId = club.id;
      lines.push(line(agentT(locale, 'field.club'), game.club?.name ?? agentT(locale, 'value.notSet'), club.name));
      if (club.cityId !== game.cityId) {
        const from = game.cityId
          ? (await prisma.city.findUnique({ where: { id: game.cityId }, select: { name: true } }))?.name ?? null
          : null;
        lines.push(line(agentAdminT(locale, 'field.city'), from, club.city.name));
        warnings.push(agentAdminT(locale, 'warn.cityMove', { from: from ?? agentT(locale, 'value.notSet'), to: club.city.name }));
      }
    }
    if (patch.courtId !== undefined && patch.courtId !== game.courtId) {
      if (patch.courtId === null) {
        body.courtId = null;
        lines.push(line(agentT(locale, 'field.court'), game.court?.name ?? null, agentT(locale, 'value.noCourt')));
      } else {
        const court = await prisma.court.findUnique({
          where: { id: patch.courtId },
          select: { id: true, name: true, clubId: true, isActive: true },
        });
        if (!court || !court.isActive) throw new ApiError(404, 'Court not found');
        if (targetClub && court.clubId !== targetClub.id) throw new ApiError(400, 'Court does not belong to the selected club');
        body.courtId = court.id;
        lines.push(line(agentT(locale, 'field.court'), game.court?.name ?? agentT(locale, 'value.noCourt'), court.name));
      }
    } else if ('clubId' in body && game.court && game.court.clubId !== body.clubId) {
      warnings.push(agentT(locale, 'warn.courtCleared'));
      lines.push(line(agentT(locale, 'field.court'), game.court.name, agentT(locale, 'value.noCourt')));
    }

    const timezone = isValidTimeZone(targetClub?.timezone) ? targetClub!.timezone! : gameTimezone(game, ctx.timezone);
    if (patch.startTime !== undefined || patch.endTime !== undefined) {
      const start = patch.startTime !== undefined ? parseAgentDate(patch.startTime, timezone) : game.startTime;
      if (!start) throw new ApiError(400, 'startTime is not a valid date-time');
      const end =
        patch.endTime !== undefined
          ? parseAgentDate(patch.endTime, timezone)
          : new Date(start.getTime() + (game.endTime.getTime() - game.startTime.getTime()));
      if (!end) throw new ApiError(400, 'endTime is not a valid date-time');
      if (!(start < end)) throw new ApiError(400, 'endTime must be after startTime');
      if (end.getTime() - start.getTime() > 24 * 60 * 60 * 1000) throw new ApiError(400, 'A game cannot last more than 24 hours');
      const startChanged = !game.timeIsSet || start.getTime() !== game.startTime.getTime();
      const endChanged = !game.timeIsSet || end.getTime() !== game.endTime.getTime();
      if (startChanged || endChanged) {
        body.startTime = start.toISOString();
        body.endTime = end.toISOString();
        body.timeIsSet = true;
        const before = (date: Date) => (game.timeIsSet ? formatAgentDateTime(date, timezone, locale) : agentT(locale, 'value.notSet'));
        if (startChanged) lines.push(line(agentT(locale, 'field.start'), before(game.startTime), formatAgentDateTime(start, timezone, locale)));
        if (endChanged) lines.push(line(agentT(locale, 'field.end'), before(game.endTime), formatAgentDateTime(end, timezone, locale)));
        if (start.getTime() < ctx.now.getTime()) warnings.push(agentT(locale, 'warn.past'));
      }
    }

    if (patch.name !== undefined && (patch.name || null) !== (game.name || null)) {
      body.name = patch.name || null;
      lines.push(line(agentT(locale, 'field.name'), clip(game.name, 60), clip(patch.name, 60) ?? agentT(locale, 'value.notSet')));
    }
    if (patch.description !== undefined && (patch.description || null) !== (game.description || null)) {
      body.description = patch.description || null;
      lines.push(line(agentT(locale, 'field.description'), clip(game.description), clip(patch.description) ?? agentT(locale, 'value.notSet')));
    }
    if (patch.maxParticipants !== undefined && patch.maxParticipants !== game.maxParticipants) {
      body.maxParticipants = patch.maxParticipants;
      lines.push(line(agentT(locale, 'field.maxParticipants'), String(game.maxParticipants), String(patch.maxParticipants)));
      if (game._count.participants > patch.maxParticipants) {
        warnings.push(agentT(locale, 'warn.overCapacity', { count: game._count.participants }));
      }
    }
    if (patch.isPublic !== undefined && patch.isPublic !== game.isPublic) {
      body.isPublic = patch.isPublic;
      const show = (value: boolean) => agentT(locale, value ? 'value.public' : 'value.private');
      lines.push(line(agentT(locale, 'field.visibility'), show(game.isPublic), show(patch.isPublic)));
      if (patch.isPublic) warnings.push(agentT(locale, 'warn.visibleToAll'));
    }
    if (patch.allowDirectJoin !== undefined && patch.allowDirectJoin !== game.allowDirectJoin) {
      body.allowDirectJoin = patch.allowDirectJoin;
      const show = (value: boolean) => agentT(locale, value ? 'value.yes' : 'value.no');
      lines.push(line(agentT(locale, 'field.directJoin'), show(game.allowDirectJoin), show(patch.allowDirectJoin)));
    }

    if (Object.keys(body).length === 0) throw new ApiError(400, 'Nothing to change: the game already has these values');
    assertAdminUpdateSupported(game, body);

    if (['startTime', 'clubId'].some((key) => key in body)) {
      const others = await prisma.gameParticipant.count({
        where: { gameId: game.id, status: ParticipantStatus.PLAYING, userId: { not: principal.userId } },
      });
      if (others > 0) warnings.push(agentT(locale, 'warn.notify', { count: others }));
    }

    const title = agentGameTitle(game);
    const preview: AgentActionPreview = {
      title: agentAdminT(locale, 'preview.adminGame.title', { game: clip(title, 60) ?? title }),
      lines,
      warnings,
    };
    const plan: z.infer<typeof adminGamePlanSchema> = {
      gameId: game.id,
      body,
      syncGameCourts: 'clubId' in body || 'courtId' in body,
    };
    return proposeAgentAction(ctx, { toolName: 'admin_update_game', input: args, plan, preview });
  },
  confirm: {
    authorize: async (principal, rawPlan) => {
      const plan = parsePlan(adminGamePlanSchema, rawPlan);
      await authorizeAdminGameEdit(principal, plan.gameId);
    },
    execute: async (ctx, rawPlan) => {
      const plan = parsePlan(adminGamePlanSchema, rawPlan);
      assertAdminUpdateSupported(await loadGameForWrite(plan.gameId), plan.body);
      // `PUT /games/:id` as a platform admin; the service derives `cityId` from the club.
      await GameUpdateService.updateGame(plan.gameId, { ...plan.body }, ctx.principal.userId, ctx.principal.isAdmin);
      if (plan.syncGameCourts) {
        const [updated, courts] = await Promise.all([
          prisma.game.findUnique({ where: { id: plan.gameId }, select: { courtId: true } }),
          prisma.gameCourt.findMany({ where: { gameId: plan.gameId }, select: { courtId: true } }),
        ]);
        const wanted = updated?.courtId ? [updated.courtId] : [];
        if (courts.length <= 1 && courts.map((c) => c.courtId).join(',') !== wanted.join(',')) {
          await GameCourtService.setGameCourts(plan.gameId, wanted);
        }
      }
      const after = await prisma.game.findUniqueOrThrow({
        where: { id: plan.gameId },
        select: { startTime: true, endTime: true, timeIsSet: true, cityId: true, clubId: true, courtId: true, isPublic: true, maxParticipants: true },
      });
      return {
        message: agentT(ctx.locale, 'result.updated'),
        entities: await gameEntityFor(plan.gameId, ctx.principal.userId),
        modelData: {
          gameId: plan.gameId,
          startTime: after.timeIsSet ? after.startTime.toISOString() : null,
          endTime: after.timeIsSet ? after.endTime.toISOString() : null,
          cityId: after.cityId,
          clubId: after.clubId,
          courtId: after.courtId,
          isPublic: after.isPublic,
          maxParticipants: after.maxParticipants,
        },
      };
    },
  },
});

// --- admin_list_pending_events ---------------------------------------------------------------

const PENDING_EVENTS_MAX = 30;

export const adminListPendingEventsTool = defineTool({
  name: 'admin_list_pending_events',
  description:
    'Admin only. EVENT listings waiting for admin approval (oldest request first), optionally in one city. Use before admin_approve_event / admin_decline_event.',
  kind: 'read',
  scope: 'admin',
  input: z
    .object({
      cityId: ID.optional().describe('City id from list_cities; all cities when omitted'),
      limit: z.number().int().min(1).max(PENDING_EVENTS_MAX).optional(),
    })
    .strict(),
  label: (_args, locale) => agentAdminT(locale, 'label.adminPendingEvents'),
  handler: async (ctx, args) => {
    assertAgentAdmin(ctx.principal);
    const where = {
      entityType: EntityType.EVENT,
      eventApprovalStatus: EventApprovalStatus.ON_APPROVE,
      ...(args.cityId ? { cityId: args.cityId } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.game.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        take: args.limit ?? 10,
        select: { ...agentGameSummarySelect(ctx.principal.userId), createdAt: true },
      }),
      prisma.game.count({ where }),
    ]);
    const owners = await prisma.gameParticipant.findMany({
      where: { gameId: { in: rows.map((row) => row.id) }, role: ParticipantRole.OWNER },
      select: { gameId: true, user: { select: { id: true, firstName: true, lastName: true } } },
    });
    const ownerOf = new Map(owners.map((row) => [row.gameId, row.user]));
    const events = rows.map((row) => {
      const owner = ownerOf.get(row.id) ?? null;
      return {
        ...toAgentGameSummary(row),
        requestedAt: row.createdAt.toISOString(),
        organizer: owner ? { userId: owner.id, name: agentUserDisplayName(owner) } : null,
      };
    });
    return {
      data: { total, events },
      summary: agentAdminT(ctx.locale, 'summary.pendingEvents', { count: total }),
      entities: rows.map(agentGameEntity),
    };
  },
});

// --- admin_approve_event / admin_decline_event -----------------------------------------------

type EventDecision = 'APPROVE' | 'DECLINE';

const eventDecisionInput = z.object({ gameId: ID }).strict();
const eventDecisionPlanSchema = z.object({ gameId: z.string(), decision: z.enum(['APPROVE', 'DECLINE']) }).strict();

/** The checks `EventApprovalService.decide` runs, up front so the card never offers a dead action. */
async function loadPendingEvent(gameId: string) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: {
      id: true,
      name: true,
      entityType: true,
      eventApprovalStatus: true,
      startTime: true,
      timeIsSet: true,
      club: { select: { name: true } },
      city: { select: { name: true, timezone: true } },
      participants: {
        where: { role: ParticipantRole.OWNER },
        select: { user: { select: { firstName: true, lastName: true } } },
        take: 1,
      },
    },
  });
  if (!game || game.entityType !== EntityType.EVENT) throw new ApiError(404, 'Event not found');
  if (game.eventApprovalStatus !== EventApprovalStatus.ON_APPROVE) throw new ApiError(400, 'Event is not awaiting approval');
  return game;
}

function eventDecisionTool(name: 'admin_approve_event' | 'admin_decline_event', decision: EventDecision) {
  const approve = decision === 'APPROVE';
  return defineTool({
    name,
    description: approve
      ? 'Admin only. Prepare approving an EVENT listing that awaits approval (ids from admin_list_pending_events). Creates a confirmation card.'
      : 'Admin only. Prepare declining an EVENT listing that awaits approval (ids from admin_list_pending_events). Creates a confirmation card.',
    kind: 'write',
    riskTier: 'critical',
    scope: 'admin',
    promptHint: approve
      ? '(platform admin) approve an EVENT listing awaiting approval'
      : '(platform admin) decline an EVENT listing awaiting approval',
    input: eventDecisionInput,
    label: (_args, locale) => agentAdminT(locale, approve ? 'label.adminApproveEvent' : 'label.adminDeclineEvent'),
    handler: async (ctx, args) => {
      const { principal, locale } = ctx;
      assertAgentAdmin(principal);
      const game = await loadPendingEvent(args.gameId);
      const title = agentGameTitle(game);
      const owner = game.participants[0]?.user;
      const timezone = gameTimezone(game, ctx.timezone);
      const lines: AgentActionPreviewLine[] = [
        line(agentT(locale, 'field.when'), null, when(game, timezone, locale)),
        ...(game.city ? [line(agentAdminT(locale, 'field.city'), null, game.city.name)] : []),
        ...(owner ? [line(agentAdminT(locale, 'field.organizer'), null, agentUserDisplayName(owner))] : []),
        line(
          agentAdminT(locale, 'field.approval'),
          agentAdminT(locale, 'value.onApprove'),
          agentAdminT(locale, approve ? 'value.approved' : 'value.declined'),
        ),
      ];
      const preview: AgentActionPreview = {
        title: agentAdminT(locale, approve ? 'preview.approveEvent.title' : 'preview.declineEvent.title', {
          game: clip(title, 60) ?? title,
        }),
        lines,
        warnings: [agentAdminT(locale, approve ? 'warn.approveEvent' : 'warn.declineEvent')],
      };
      const plan: z.infer<typeof eventDecisionPlanSchema> = { gameId: game.id, decision };
      return proposeAgentAction(ctx, { toolName: name, input: args, plan, preview });
    },
    confirm: {
      authorize: async (principal, rawPlan) => {
        parsePlan(eventDecisionPlanSchema, rawPlan);
        assertAgentAdmin(principal);
      },
      execute: async (ctx, rawPlan) => {
        const plan = parsePlan(eventDecisionPlanSchema, rawPlan);
        // `POST /games/:id/event-approval {decision}` (requireAdmin).
        await EventApprovalService.decide(plan.gameId, ctx.principal.userId, plan.decision);
        return {
          message: agentAdminT(ctx.locale, plan.decision === 'APPROVE' ? 'result.eventApproved' : 'result.eventDeclined'),
          entities: await gameEntityFor(plan.gameId, ctx.principal.userId),
          modelData: { gameId: plan.gameId, eventApprovalStatus: plan.decision === 'APPROVE' ? 'APPROVED' : 'DECLINED' },
        };
      },
    },
  });
}

export const adminApproveEventTool = eventDecisionTool('admin_approve_event', 'APPROVE');
export const adminDeclineEventTool = eventDecisionTool('admin_decline_event', 'DECLINE');

export const ADMIN_TOOLS = [
  adminFindUsersTool,
  adminGetUserTool,
  adminUpdateUserFlagsTool,
  adminUpdateGameTool,
  adminListPendingEventsTool,
  adminApproveEventTool,
  adminDeclineEventTool,
];
