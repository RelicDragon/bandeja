/**
 * Game write tools (phase 3a, registered): `update_game`, `invite_players`.
 * Each handler only validates (zod `.strict()`), runs the guard, loads the current state,
 * renders a preview (from → to, user language, city timezone) and proposes a pending
 * action. Nothing changes until the user confirms; then `confirm.authorize` re-runs the
 * same guard against a fresh principal and `confirm.execute` calls the service the HTTP
 * route calls, with the body the HTTP client would send.
 */
import { EntityType, ParticipantRole, ParticipantStatus } from '@prisma/client';
import { z } from 'zod/v4';
import type { AgentActionPreview, AgentActionPreviewLine, AgentEntityRef } from '@bandeja/shared/agentContract';
import prisma from '../../../config/database';
import { ApiError } from '../../../utils/ApiError';
import { validateGameCanAcceptParticipants } from '../../../utils/participantValidation';
import { GameCourtService } from '../../gameCourt/gameCourt.service';
import { GameUpdateService } from '../../game/update.service';
import { sendInviteAsUser } from '../../invite/sendInviteAsUser.service';
import { loadBlockedUserIds } from '../../user/coPlay.service';
import type { AgentPrincipal } from '../access/agentPrincipal';
import { assertAgentCanInviteToGame, assertAgentGamePermission } from '../access/agentGameAccess';
import { proposeAgentAction } from '../agentActionPropose';
import { isValidTimeZone } from '../agentContext.service';
import { agentGameTitle, agentLocalTimes } from '../dto/game.dto';
import { AGENT_USER_CARD_SELECT, agentUserDisplayName, agentUserEntity } from '../dto/user.dto';
import { agentT, formatAgentDateTime } from '../i18n/agentI18n';
import { defineTool, parseAgentDate } from './registry';
import {
  assertRosterToolSupported,
  clip,
  gameEntityFor,
  gameTimezone,
  line,
  loadGameForWrite,
  myParticipant,
  overlapWarning,
  parsePlan,
  when,
  type GameWriteRow,
} from './writeHelpers';

const ID = z.string().min(1).max(64);
const EDIT_ROLES: ParticipantRole[] = [ParticipantRole.OWNER, ParticipantRole.ADMIN];
/** Same guard as the roster/settings routes: owner/admin, not archived, results not started. */
const EDIT_OPTIONS = { requireRosterMutable: true } as const;
/** `update_game` edits casual games only; leagues and EVENT listings have their own flows. */
const UPDATABLE_ENTITY_TYPES: EntityType[] = [
  EntityType.GAME,
  EntityType.TOURNAMENT,
  EntityType.TRAINING,
  EntityType.BAR,
];
const INVITE_MAX = 10;


// --- update_game -----------------------------------------------------------------------------

const updatePatchSchema = z
  .object({
    startTime: z.string().max(40).optional().describe('New start: YYYY-MM-DDTHH:mm (game city time) or ISO date-time'),
    endTime: z
      .string()
      .max(40)
      .optional()
      .describe('New end; when only startTime is given the duration is kept'),
    clubId: ID.optional().describe('Club id from search_clubs'),
    courtId: ID.nullable().optional().describe('Court id from get_club, or null for no court'),
    name: z.string().trim().max(100).nullable().optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    maxParticipants: z.number().int().min(2).max(64).optional(),
    isPublic: z.boolean().optional(),
    allowDirectJoin: z.boolean().optional().describe('true = players join directly; false = organizer approves'),
  })
  .strict();

const updateGameInput = z
  .object({
    gameId: ID,
    patch: updatePatchSchema.refine((patch) => Object.keys(patch).length > 0, 'patch must change at least one field'),
  })
  .strict();

const updatePlanSchema = z
  .object({
    gameId: z.string(),
    /** Exactly the `PUT /games/:id` body the app would send. */
    body: z.record(z.string(), z.unknown()),
    /** Club or court changed: keep `GameCourt` in step with the primary court, as the app does. */
    syncGameCourts: z.boolean(),
  })
  .strict();

/** Refusals that must hold at propose AND confirm time (links can appear in between). */
function assertUpdateSupported(
  game: Pick<GameWriteRow, 'entityType' | '_count'>,
  body: Record<string, unknown>,
): void {
  if (!UPDATABLE_ENTITY_TYPES.includes(game.entityType)) {
    throw new ApiError(400, 'The assistant can edit games, tournaments, trainings and bar meetups; use the app for leagues and events');
  }
  const touchesSchedule = ['startTime', 'endTime', 'clubId', 'courtId'].some((key) => key in body);
  if (touchesSchedule && game._count.externalBookings > 0) {
    throw new ApiError(400, 'This game is linked to court bookings; change its time and place in the app');
  }
  const touchesPlace = 'clubId' in body || 'courtId' in body;
  if (touchesPlace && game._count.gameCourts > 1) {
    throw new ApiError(400, 'This game uses several courts; change the courts in the app');
  }
}

/** A start moved by more than this makes `update_game` critical for that call (plan §15). */
export const UPDATE_GAME_CRITICAL_MOVE_MS = 24 * 60 * 60 * 1000;

type UpdateGameRiskState = { isPublic: boolean; startTime: Date | null; timezone: string };

/**
 * Per-call escalation of `update_game` to critical (always asks, even when the user
 * always allows the tool): public ↔ private, or the start moved by more than 24 h.
 * Without a known current state it escalates (fail closed).
 */
export function escalateUpdateGame(
  args: z.infer<typeof updateGameInput>,
  currentState: unknown,
): 'critical' | undefined {
  const state = currentState as UpdateGameRiskState | undefined;
  if (!state || typeof state.isPublic !== 'boolean') return 'critical';
  const { patch } = args;
  if (patch.isPublic !== undefined && patch.isPublic !== state.isPublic) return 'critical';
  if (patch.startTime !== undefined && state.startTime) {
    const next = parseAgentDate(patch.startTime, state.timezone);
    if (!next || Math.abs(next.getTime() - state.startTime.getTime()) > UPDATE_GAME_CRITICAL_MOVE_MS) return 'critical';
  }
  return undefined;
}

export const updateGameTool = defineTool({
  name: 'update_game',
  description:
    'Prepare a change to a game the user organises (owner or admin): time, club, court, name, description, max players, public/private, direct join. Creates a confirmation card; nothing changes until the user confirms. Times are in the game city timezone.',
  kind: 'write',
  riskTier: 'standard',
  scope: 'user',
  promptHint: 'change a game the user organises: time, club, court, name, description, max players, public/private, direct join',
  input: updateGameInput,
  escalate: (_ctx, args, currentState) => escalateUpdateGame(args, currentState),
  label: (_args, locale) => agentT(locale, 'label.updateGame'),
  handler: async (ctx, args) => {
    const { principal, locale } = ctx;
    await assertAgentGamePermission(principal, args.gameId, EDIT_ROLES, EDIT_OPTIONS);
    const game = await loadGameForWrite(args.gameId);
    const patch = args.patch;
    const body: Record<string, unknown> = {};
    const lines: AgentActionPreviewLine[] = [];
    const warnings: string[] = [];

    // Club / court (validated like `GameUpdateService`, which re-checks on confirm).
    let targetClub = game.club ? { ...game.club, cityId: game.cityId, timezone: game.city?.timezone ?? null } : null;
    if (patch.clubId !== undefined && patch.clubId !== game.clubId) {
      const club = await prisma.club.findUnique({
        where: { id: patch.clubId },
        select: { id: true, name: true, isActive: true, cityId: true, city: { select: { timezone: true } } },
      });
      if (!club || !club.isActive) throw new ApiError(404, 'Club not found');
      targetClub = { id: club.id, name: club.name, cityId: club.cityId, timezone: club.city.timezone };
      body.clubId = club.id;
      lines.push(line(agentT(locale, 'field.club'), game.club?.name ?? agentT(locale, 'value.notSet'), club.name));
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
        if (targetClub && court.clubId !== targetClub.id) {
          throw new ApiError(400, 'Court does not belong to the selected club');
        }
        body.courtId = court.id;
        lines.push(line(agentT(locale, 'field.court'), game.court?.name ?? agentT(locale, 'value.noCourt'), court.name));
      }
    } else if ('clubId' in body && game.court && game.court.clubId !== body.clubId) {
      // The service drops a court that belongs to another club.
      warnings.push(agentT(locale, 'warn.courtCleared'));
      lines.push(line(agentT(locale, 'field.court'), game.court.name, agentT(locale, 'value.noCourt')));
    }

    // Times: wall clock in the (target) club city timezone.
    const timezone = isValidTimeZone(targetClub?.timezone) ? targetClub!.timezone! : gameTimezone(game, ctx.timezone);
    let nextStart = game.startTime;
    let nextEnd = game.endTime;
    if (patch.startTime !== undefined || patch.endTime !== undefined) {
      const start = patch.startTime !== undefined ? parseAgentDate(patch.startTime, timezone) : game.startTime;
      if (!start) throw new ApiError(400, 'startTime is not a valid date-time');
      let end: Date | null;
      if (patch.endTime !== undefined) {
        end = parseAgentDate(patch.endTime, timezone);
        if (!end) throw new ApiError(400, 'endTime is not a valid date-time');
      } else {
        end = new Date(start.getTime() + (game.endTime.getTime() - game.startTime.getTime()));
      }
      if (!(start < end)) throw new ApiError(400, 'endTime must be after startTime');
      if (end.getTime() - start.getTime() > 24 * 60 * 60 * 1000) throw new ApiError(400, 'A game cannot last more than 24 hours');
      const startChanged = !game.timeIsSet || start.getTime() !== game.startTime.getTime();
      const endChanged = !game.timeIsSet || end.getTime() !== game.endTime.getTime();
      if (startChanged || endChanged) {
        // The app always sends both times plus `timeIsSet: true` from the time picker.
        body.startTime = start.toISOString();
        body.endTime = end.toISOString();
        body.timeIsSet = true;
        nextStart = start;
        nextEnd = end;
        if (startChanged) {
          lines.push(line(agentT(locale, 'field.start'), game.timeIsSet ? formatAgentDateTime(game.startTime, timezone, locale) : agentT(locale, 'value.notSet'), formatAgentDateTime(start, timezone, locale)));
        }
        if (endChanged) {
          lines.push(line(agentT(locale, 'field.end'), game.timeIsSet ? formatAgentDateTime(game.endTime, timezone, locale) : agentT(locale, 'value.notSet'), formatAgentDateTime(end, timezone, locale)));
        }
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
      const label = (value: boolean) => agentT(locale, value ? 'value.public' : 'value.private');
      lines.push(line(agentT(locale, 'field.visibility'), label(game.isPublic), label(patch.isPublic)));
      if (patch.isPublic) warnings.push(agentT(locale, 'warn.visibleToAll'));
    }
    if (patch.allowDirectJoin !== undefined && patch.allowDirectJoin !== game.allowDirectJoin) {
      body.allowDirectJoin = patch.allowDirectJoin;
      const label = (value: boolean) => agentT(locale, value ? 'value.yes' : 'value.no');
      lines.push(line(agentT(locale, 'field.directJoin'), label(game.allowDirectJoin), label(patch.allowDirectJoin)));
    }

    if (Object.keys(body).length === 0) {
      throw new ApiError(400, 'Nothing to change: the game already has these values');
    }
    assertUpdateSupported(game, body);

    // Time or place changes post a system message that notifies the confirmed players.
    if (['startTime', 'clubId'].some((key) => key in body)) {
      const others = await prisma.gameParticipant.count({
        where: { gameId: game.id, status: ParticipantStatus.PLAYING, userId: { not: principal.userId } },
      });
      if (others > 0) warnings.push(agentT(locale, 'warn.notify', { count: others }));
    }
    if ('startTime' in body) {
      const mine = await myParticipant(game.id, principal.userId);
      if (mine?.status === ParticipantStatus.PLAYING) {
        const overlap = await overlapWarning(principal.userId, { id: game.id, startTime: nextStart, endTime: nextEnd, timeIsSet: true }, timezone, locale);
        if (overlap) warnings.push(overlap);
      }
    }

    const title = agentGameTitle(game);
    const preview: AgentActionPreview = {
      title: agentT(locale, 'preview.update.title', { game: clip(title, 60) ?? title }),
      lines,
      warnings,
    };
    const plan: z.infer<typeof updatePlanSchema> = {
      gameId: game.id,
      body,
      syncGameCourts: 'clubId' in body || 'courtId' in body,
    };
    const riskState: UpdateGameRiskState = {
      isPublic: game.isPublic,
      startTime: game.timeIsSet ? game.startTime : null,
      timezone,
    };
    return proposeAgentAction(ctx, { toolName: 'update_game', input: args, plan, preview, currentState: riskState });
  },
  confirm: {
    authorize: async (principal, rawPlan) => {
      const plan = parsePlan(updatePlanSchema, rawPlan);
      await assertAgentGamePermission(principal, plan.gameId, EDIT_ROLES, EDIT_OPTIONS);
    },
    execute: async (ctx, rawPlan) => {
      const plan = parsePlan(updatePlanSchema, rawPlan);
      const game = await loadGameForWrite(plan.gameId);
      assertUpdateSupported(game, plan.body);
      // `updateGame` mutates its input; pass a copy of the stored body.
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
        select: { city: { select: { timezone: true } }, startTime: true, endTime: true, timeIsSet: true, clubId: true, courtId: true, isPublic: true, maxParticipants: true },
      });
      return {
        message: agentT(ctx.locale, 'result.updated'),
        entities: await gameEntityFor(plan.gameId, ctx.principal.userId),
        modelData: {
          gameId: plan.gameId,
          startTime: after.timeIsSet ? after.startTime.toISOString() : null,
          endTime: after.timeIsSet ? after.endTime.toISOString() : null,
          ...agentLocalTimes(after, after.city?.timezone),
          clubId: after.clubId,
          courtId: after.courtId,
          isPublic: after.isPublic,
          maxParticipants: after.maxParticipants,
        },
      };
    },
  },
});

// --- invite_players --------------------------------------------------------------------------

const invitePlayersInput = z
  .object({
    gameId: ID,
    userIds: z
      .array(ID)
      .min(1)
      .max(INVITE_MAX)
      .refine((ids) => new Set(ids).size === ids.length, 'userIds must be unique')
      .describe('Player ids from search_players / get_player (max 10)'),
  })
  .strict();

const invitePlanSchema = z.object({ gameId: z.string(), userIds: z.array(z.string()).min(1).max(INVITE_MAX) }).strict();

/**
 * Invitees must be players the agent may show (`get_player` rules): active, not the
 * user, not in a block relation either way. Anything else is "not found".
 */
async function resolveInvitees(principal: AgentPrincipal, userIds: string[]) {
  if (userIds.includes(principal.userId)) throw new ApiError(404, 'User not found');
  const [rows, blocked] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds }, isActive: true }, select: AGENT_USER_CARD_SELECT }),
    loadBlockedUserIds(principal.userId),
  ]);
  const byId = new Map(rows.map((row) => [row.id, row]));
  return userIds.map((id) => {
    const row = byId.get(id);
    if (!row || blocked.has(id)) throw new ApiError(404, 'User not found');
    return row;
  });
}

export const invitePlayersTool = defineTool({
  name: 'invite_players',
  description:
    'Prepare inviting players (ids from search_players / get_player, max 10) to a game the user may invite to. Creates a confirmation card; no invite is sent until the user confirms.',
  kind: 'write',
  riskTier: 'standard',
  scope: 'user',
  promptHint: 'invite players to a game',
  input: invitePlayersInput,
  label: (_args, locale) => agentT(locale, 'label.invitePlayers'),
  handler: async (ctx, args) => {
    const { principal, locale } = ctx;
    await assertAgentCanInviteToGame(principal, args.gameId);
    const game = await loadGameForWrite(args.gameId);
    assertRosterToolSupported(game);
    // Same gates as `ParticipantService.sendInvite`.
    validateGameCanAcceptParticipants(game);
    if (game.entityType === EntityType.EVENT) throw new ApiError(400, 'Events cannot be invited to; use going or looking');
    const invitees = await resolveInvitees(principal, args.userIds);
    const roster = await prisma.gameParticipant.findMany({
      where: { gameId: game.id, userId: { in: args.userIds } },
      select: { userId: true, status: true },
    });
    const statusOf = new Map(roster.map((row) => [row.userId, row.status]));
    const warnings: string[] = [];
    const lines: AgentActionPreviewLine[] = [];
    let fresh = 0;
    for (const invitee of invitees) {
      const name = agentUserDisplayName(invitee);
      const status = statusOf.get(invitee.id);
      if (status === ParticipantStatus.PLAYING || status === ParticipantStatus.NON_PLAYING) {
        warnings.push(agentT(locale, 'warn.alreadyOnRoster', { name }));
        continue;
      }
      if (status === ParticipantStatus.INVITED) {
        warnings.push(agentT(locale, 'warn.alreadyInvited', { name }));
        continue;
      }
      fresh += 1;
      lines.push(line(agentT(locale, 'field.invitee'), null, name));
    }
    if (fresh === 0) throw new ApiError(400, 'Everyone is already on the roster or invited');
    const timezone = gameTimezone(game, ctx.timezone);
    const title = agentGameTitle(game);
    const preview: AgentActionPreview = {
      title: agentT(locale, 'preview.invite.title', { game: clip(title, 60) ?? title }),
      lines: [line(agentT(locale, 'field.when'), null, when(game, timezone, locale)), ...lines],
      warnings,
    };
    const plan: z.infer<typeof invitePlanSchema> = { gameId: game.id, userIds: args.userIds };
    return proposeAgentAction(ctx, {
      toolName: 'invite_players',
      input: args,
      plan,
      preview,
    });
  },
  confirm: {
    authorize: async (principal, rawPlan) => {
      const plan = parsePlan(invitePlanSchema, rawPlan);
      await assertAgentCanInviteToGame(principal, plan.gameId);
      await resolveInvitees(principal, plan.userIds);
    },
    execute: async (ctx, rawPlan) => {
      const plan = parsePlan(invitePlanSchema, rawPlan);
      assertRosterToolSupported(await loadGameForWrite(plan.gameId));
      const invitees = await resolveInvitees(ctx.principal, plan.userIds);
      // One `POST /invites` per player, as the app's player picker does.
      let sent = 0;
      let firstError: unknown = null;
      const invited: Extract<AgentEntityRef, { type: 'user' }>[] = [];
      for (const invitee of invitees) {
        try {
          const result = await sendInviteAsUser(ctx.principal, { gameId: plan.gameId, receiverId: invitee.id });
          if (result.kind === 'created' || result.kind === 'acceptedFromQueue') {
            sent += 1;
            invited.push(agentUserEntity(invitee));
          }
        } catch (error) {
          firstError ??= error;
        }
      }
      if (sent === 0 && firstError) throw firstError;
      return {
        message: sent > 0 ? agentT(ctx.locale, 'result.invited', { count: sent }) : agentT(ctx.locale, 'result.inviteNone'),
        entities: [...(await gameEntityFor(plan.gameId, ctx.principal.userId)), ...invited],
        modelData: { gameId: plan.gameId, invitedUserIds: invited.map((entity) => entity.id) },
      };
    },
  },
});

export const GAME_WRITE_TOOLS = [updateGameTool, invitePlayersTool];
