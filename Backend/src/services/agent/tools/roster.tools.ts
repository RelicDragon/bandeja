/**
 * Organizer roster tools (phase 4b): `remove_participant`, `set_game_admin`,
 * `accept_from_queue`, `decline_from_queue`, `set_trainer`. Matrix + HTTP-parity tested in
 * `__tests__/agentRoster.integration.test.ts` (`npm run test:agent-roster`).
 *
 * The HTTP routes (`routes/game.routes.ts`, "Roster routes") are authorized ONLY by
 * middleware, so each tool re-runs that exact preset through `assertAgentGamePermission`
 * (visibility first: hidden → 404, never 403):
 *   remove_participant  POST /:id/kick-user           canManageGameRoster        → AdminService.kickUser
 *   set_game_admin      POST /:id/add-admin|revoke-admin canManageGameRosterAsOwner → AdminService.addAdmin / revokeAdmin
 *   accept_from_queue   POST /:id/accept-join-queue   canManageGameRoster        → ParticipantService.acceptNonPlayingParticipant
 *   decline_from_queue  POST /:id/decline-join-queue  canManageGameRoster        → ParticipantService.declineNonPlayingParticipant
 *   set_trainer         POST /:id/set-trainer         canManageGameRosterAsOwner → AdminService.setTrainer
 * then calls the controller's service with the controller's arguments (`req.userId` = the
 * principal). Actor checks the services add on top (admins can't kick the owner, decline
 * needs a roster row, set-trainer needs the owner row) are mirrored at propose time so the
 * card never offers what confirm would refuse. Target checks are stricter than HTTP where
 * the service would do something harmful (demoting the owner via add-admin / set-trainer).
 * Never here: ownership transfer, delete, substitutions (docs/plans/ai-agent.md §5).
 */
import { EntityType, ParticipantRole, ParticipantStatus } from '@prisma/client';
import { z } from 'zod/v4';
import type { AgentActionPreview, AgentActionPreviewLine } from '@bandeja/shared/agentContract';
import prisma from '../../../config/database';
import { ApiError } from '../../../utils/ApiError';
import { fetchGameWithPlayingParticipants } from '../../../utils/gameQueries';
import { getParentGameParticipant } from '../../../utils/parentGamePermissions';
import { canUserManageQueue, validatePlayerCanJoinGame } from '../../../utils/participantValidation';
import { AdminService } from '../../game/admin.service';
import { ParticipantService } from '../../game/participant.service';
import type { AgentPrincipal } from '../access/agentPrincipal';
import { assertAgentGamePermission } from '../access/agentGameAccess';
import { proposeAgentAction } from '../agentActionPropose';
import { agentGameTitle } from '../dto/game.dto';
import { AGENT_USER_CARD_SELECT, agentUserDisplayName, agentUserEntity, type AgentUserCardRow } from '../dto/user.dto';
import { agentT } from '../i18n/agentI18n';
import { agentRosterT } from '../i18n/agentRosterI18n';
import { defineTool, type AgentToolContext, type AgentWriteContext } from './registry';
import {
  assertRosterToolSupported,
  clip,
  gameEntityFor,
  gameTimezone,
  line,
  loadGameForWrite,
  parsePlan,
  when,
  type GameWriteRow,
} from './writeHelpers';

const ID = z.string().min(1).max(64);
/** `canManageGameRoster`: owner/admin (or parent-season owner/admin, or platform admin), results not started, not archived. */
const MANAGE_ROLES: ParticipantRole[] = [ParticipantRole.OWNER, ParticipantRole.ADMIN];
/** `canManageGameRosterAsOwner`: same gates, owner only. */
const OWNER_ROLES: ParticipantRole[] = [ParticipantRole.OWNER];
const ROSTER_OPTIONS = { requireRosterMutable: true } as const;
const ON_ROSTER: ParticipantStatus[] = [ParticipantStatus.PLAYING, ParticipantStatus.NON_PLAYING];

type Guard = { roles: ParticipantRole[] };
const MANAGE: Guard = { roles: MANAGE_ROLES };
const OWNER: Guard = { roles: OWNER_ROLES };

/** Middleware parity: the route's preset, behind agent visibility. */
async function guard(principal: Pick<AgentPrincipal, 'userId' | 'isAdmin'>, gameId: string, preset: Guard) {
  await assertAgentGamePermission(principal, gameId, preset.roles, ROSTER_OPTIONS);
}

type Target = {
  id: string;
  role: ParticipantRole;
  status: ParticipantStatus;
  user: AgentUserCardRow;
};

/** The target's roster row with public name fields only. Missing → the service's 404. */
async function loadTarget(gameId: string, playerId: string, status?: ParticipantStatus): Promise<Target> {
  const row = await prisma.gameParticipant.findFirst({
    where: { gameId, userId: playerId, ...(status ? { status } : {}) },
    select: { id: true, role: true, status: true, user: { select: AGENT_USER_CARD_SELECT } },
  });
  if (!row) {
    throw new ApiError(404, status === ParticipantStatus.IN_QUEUE ? 'games.joinQueueRequestNotFound' : 'User is not a participant of this game');
  }
  return row;
}

function notSelf(principal: Pick<AgentPrincipal, 'userId'>, playerId: string, hint: string): void {
  if (principal.userId === playerId) throw new ApiError(400, hint);
}

function placeLabel(locale: string, row: { role: ParticipantRole; status: ParticipantStatus }): string {
  if (row.status === ParticipantStatus.PLAYING) return agentT(locale, 'value.player');
  if (row.status === ParticipantStatus.IN_QUEUE) return agentT(locale, 'value.queue');
  if (row.status === ParticipantStatus.INVITED) return agentT(locale, 'value.invited');
  if (row.role === ParticipantRole.OWNER) return agentT(locale, 'value.organizer');
  return agentT(locale, 'value.notOnRoster');
}

function roleLabel(locale: string, role: ParticipantRole): string {
  if (role === ParticipantRole.OWNER) return agentT(locale, 'value.organizer');
  return agentRosterT(locale, role === ParticipantRole.ADMIN ? 'value.admin' : 'value.participant');
}

function gameStarted(game: GameWriteRow, now: Date): boolean {
  return game.timeIsSet && game.startTime.getTime() <= now.getTime();
}

function buildPreview(
  ctx: AgentToolContext,
  game: GameWriteRow,
  title: string,
  lines: AgentActionPreviewLine[],
  warnings: string[],
): AgentActionPreview {
  const timezone = gameTimezone(game, ctx.timezone);
  const allWarnings = gameStarted(game, ctx.now) ? [agentRosterT(ctx.locale, 'warn.gameStarted'), ...warnings] : warnings;
  return { title, lines: [line(agentT(ctx.locale, 'field.when'), null, when(game, timezone, ctx.locale)), ...lines], warnings: allWarnings };
}

function gameName(game: GameWriteRow): string {
  const title = agentGameTitle(game);
  return clip(title, 60) ?? title;
}

async function loadRosterGame(gameId: string): Promise<GameWriteRow> {
  const game = await loadGameForWrite(gameId);
  assertRosterToolSupported(game);
  return game;
}

async function resultFor(ctx: AgentWriteContext, gameId: string, playerId: string, message: string) {
  const [entities, user] = await Promise.all([
    gameEntityFor(gameId, ctx.principal.userId),
    prisma.user.findUnique({ where: { id: playerId }, select: AGENT_USER_CARD_SELECT }),
  ]);
  const row = await prisma.gameParticipant.findFirst({ where: { gameId, userId: playerId }, select: { role: true, status: true } });
  return {
    message,
    entities: user ? [...entities, agentUserEntity(user)] : entities,
    modelData: { gameId, playerId, role: row?.role ?? null, status: row?.status ?? null },
  };
}

const targetInput = z
  .object({
    gameId: ID,
    playerId: ID.describe('The player (user id from get_game roster / search_players)'),
  })
  .strict();
const targetPlanSchema = z.object({ gameId: z.string(), playerId: z.string() }).strict();

// --- remove_participant (POST /games/:id/kick-user) ------------------------------------------

/** `AdminService.kickUser`: a game admin (not a platform admin) can't remove the owner. */
async function assertMayKick(principal: Pick<AgentPrincipal, 'userId' | 'isAdmin'>, gameId: string, target: Target): Promise<void> {
  if (principal.isAdmin || target.role !== ParticipantRole.OWNER) return;
  const mine = await getParentGameParticipant(gameId, principal.userId, MANAGE_ROLES);
  if (mine && mine.participant.role === ParticipantRole.ADMIN) {
    throw new ApiError(403, 'Admins cannot kick the owner');
  }
}

export const removeParticipantTool = defineTool({
  name: 'remove_participant',
  description:
    'Prepare removing a player from a game the user organises (owner or game admin): a player, a queued player or an invite. Not for the user themselves (use leave_game). Creates a confirmation card; nothing changes until the user confirms.',
  kind: 'write',
  riskTier: 'critical',
  scope: 'user',
  input: targetInput,
  label: (_args, locale) => agentRosterT(locale, 'label.removeParticipant'),
  handler: async (ctx, args) => {
    const { principal, locale } = ctx;
    await guard(principal, args.gameId, MANAGE);
    const game = await loadRosterGame(args.gameId);
    notSelf(principal, args.playerId, 'To leave the game yourself use leave_game');
    const target = await loadTarget(game.id, args.playerId);
    await assertMayKick(principal, game.id, target);
    const name = agentUserDisplayName(target.user);
    const isOwner = target.role === ParticipantRole.OWNER;
    const trainerId = (await prisma.game.findUnique({ where: { id: game.id }, select: { trainerId: true } }))?.trainerId;
    const warnings: string[] = [];
    if (isOwner) warnings.push(agentRosterT(locale, 'warn.ownerStaysOrganizer'));
    if (trainerId === target.user.id) warnings.push(agentRosterT(locale, 'warn.trainerCleared', { name }));
    if (target.status === ParticipantStatus.INVITED) {
      warnings.push(agentRosterT(locale, 'warn.inviteCancelled'));
    } else if (!isOwner) {
      warnings.push(agentRosterT(locale, 'warn.chatNotice'));
    }
    if (target.status === ParticipantStatus.PLAYING) warnings.push(agentRosterT(locale, 'warn.seatOpens'));
    const preview = buildPreview(
      ctx,
      game,
      agentRosterT(locale, 'preview.remove.title', { name, game: gameName(game) }),
      [
        line(agentRosterT(locale, 'field.player'), null, name),
        line(
          agentRosterT(locale, 'field.place'),
          placeLabel(locale, target),
          isOwner ? agentT(locale, 'value.organizer') : agentT(locale, 'value.notOnRoster'),
        ),
      ],
      warnings,
    );
    const plan: z.infer<typeof targetPlanSchema> = { gameId: game.id, playerId: target.user.id };
    return proposeAgentAction(ctx, { toolName: 'remove_participant', input: args, plan, preview });
  },
  confirm: {
    authorize: async (principal, rawPlan) => {
      const plan = parsePlan(targetPlanSchema, rawPlan);
      await guard(principal, plan.gameId, MANAGE);
    },
    execute: async (ctx, rawPlan) => {
      const plan = parsePlan(targetPlanSchema, rawPlan);
      await loadRosterGame(plan.gameId);
      // `gameController.kickUser`: (id, req.userId, body.userId). The service re-checks the owner rule.
      await AdminService.kickUser(plan.gameId, ctx.principal.userId, plan.playerId);
      return resultFor(ctx, plan.gameId, plan.playerId, agentRosterT(ctx.locale, 'result.removed'));
    },
  },
});

// --- set_game_admin (POST /games/:id/add-admin | revoke-admin) -------------------------------

const setAdminInput = z
  .object({
    gameId: ID,
    playerId: ID.describe('The player (user id from the get_game roster)'),
    isAdmin: z.boolean().describe('true = make admin, false = remove admin rights'),
  })
  .strict();
const setAdminPlanSchema = z.object({ gameId: z.string(), playerId: z.string(), isAdmin: z.boolean() }).strict();

/**
 * Target rules. `addAdmin` sets `role = ADMIN` on any row — on the owner's row that would
 * demote the owner — so the agent requires a non-owner player on the roster.
 */
function assertAdminTarget(target: Target, isAdmin: boolean): void {
  if (target.role === ParticipantRole.OWNER) throw new ApiError(400, 'The organizer already has full rights');
  if (isAdmin) {
    if (target.role === ParticipantRole.ADMIN) throw new ApiError(400, 'Already an admin of this game');
    if (!ON_ROSTER.includes(target.status)) throw new ApiError(400, 'Only players on the roster can become admins');
  } else if (target.role !== ParticipantRole.ADMIN) {
    throw new ApiError(404, 'User is not an admin of this game');
  }
}

export const setGameAdminTool = defineTool({
  name: 'set_game_admin',
  description:
    'Prepare making a player an admin of a game the user owns, or removing their admin rights (owner only). Creates a confirmation card; nothing changes until the user confirms.',
  kind: 'write',
  riskTier: 'critical',
  scope: 'user',
  input: setAdminInput,
  label: (args, locale) => agentRosterT(locale, args?.isAdmin === false ? 'label.revokeAdmin' : 'label.addAdmin'),
  handler: async (ctx, args) => {
    const { principal, locale } = ctx;
    await guard(principal, args.gameId, OWNER);
    const game = await loadRosterGame(args.gameId);
    notSelf(principal, args.playerId, 'You cannot change your own role');
    const target = await loadTarget(game.id, args.playerId);
    assertAdminTarget(target, args.isAdmin);
    const name = agentUserDisplayName(target.user);
    const preview = buildPreview(
      ctx,
      game,
      agentRosterT(locale, args.isAdmin ? 'preview.addAdmin.title' : 'preview.revokeAdmin.title', { name, game: gameName(game) }),
      [
        line(agentRosterT(locale, 'field.player'), null, name),
        line(
          agentRosterT(locale, 'field.role'),
          roleLabel(locale, target.role),
          roleLabel(locale, args.isAdmin ? ParticipantRole.ADMIN : ParticipantRole.PARTICIPANT),
        ),
      ],
      [agentRosterT(locale, 'warn.chatNotice')],
    );
    const plan: z.infer<typeof setAdminPlanSchema> = { gameId: game.id, playerId: target.user.id, isAdmin: args.isAdmin };
    return proposeAgentAction(ctx, { toolName: 'set_game_admin', input: args, plan, preview });
  },
  confirm: {
    authorize: async (principal, rawPlan) => {
      const plan = parsePlan(setAdminPlanSchema, rawPlan);
      await guard(principal, plan.gameId, OWNER);
    },
    execute: async (ctx, rawPlan) => {
      const plan = parsePlan(setAdminPlanSchema, rawPlan);
      await loadRosterGame(plan.gameId);
      // The service checks none of this; ownership may have moved since the proposal.
      assertAdminTarget(await loadTarget(plan.gameId, plan.playerId), plan.isAdmin);
      // `gameController.addAdmin` / `revokeAdmin`: (id, req.userId, body.userId).
      if (plan.isAdmin) {
        await AdminService.addAdmin(plan.gameId, ctx.principal.userId, plan.playerId);
      } else {
        await AdminService.revokeAdmin(plan.gameId, ctx.principal.userId, plan.playerId);
      }
      return resultFor(ctx, plan.gameId, plan.playerId, agentRosterT(ctx.locale, plan.isAdmin ? 'result.adminAdded' : 'result.adminRevoked'));
    },
  },
});

// --- accept_from_queue / decline_from_queue (POST /games/:id/accept|decline-join-queue) -------

export const acceptFromQueueTool = defineTool({
  name: 'accept_from_queue',
  description:
    "Prepare accepting a player from a game's join queue into a playing seat (owner or game admin of the game). Creates a confirmation card; nothing changes until the user confirms.",
  kind: 'write',
  riskTier: 'standard',
  scope: 'user',
  input: targetInput,
  label: (_args, locale) => agentRosterT(locale, 'label.acceptFromQueue'),
  handler: async (ctx, args) => {
    const { principal, locale } = ctx;
    await guard(principal, args.gameId, MANAGE);
    const game = await loadRosterGame(args.gameId);
    const target = await loadTarget(game.id, args.playerId, ParticipantStatus.IN_QUEUE);
    // Same seat/gender/state gate `acceptNonPlayingParticipant` runs inside its transaction.
    const joinResult = await validatePlayerCanJoinGame(await fetchGameWithPlayingParticipants(prisma, game.id), target.user.id, {
      skipLevelCheck: true,
      targetIsOtherUser: true,
    });
    if (!joinResult.canJoin) throw new ApiError(400, joinResult.reason || 'errors.games.cannotAddPlayer');
    const name = agentUserDisplayName(target.user);
    const playing = game._count.participants;
    const preview = buildPreview(
      ctx,
      game,
      agentRosterT(locale, 'preview.accept.title', { name, game: gameName(game) }),
      [
        line(agentRosterT(locale, 'field.player'), null, name),
        line(agentRosterT(locale, 'field.place'), agentT(locale, 'value.queue'), agentT(locale, 'value.player')),
        ...(game.entityType === EntityType.EVENT
          ? []
          : [line(agentT(locale, 'field.players'), `${playing}/${game.maxParticipants}`, `${playing + 1}/${game.maxParticipants}`)]),
      ],
      [agentRosterT(locale, 'warn.chatNotice')],
    );
    const plan: z.infer<typeof targetPlanSchema> = { gameId: game.id, playerId: target.user.id };
    return proposeAgentAction(ctx, { toolName: 'accept_from_queue', input: args, plan, preview });
  },
  confirm: {
    authorize: async (principal, rawPlan) => {
      const plan = parsePlan(targetPlanSchema, rawPlan);
      await guard(principal, plan.gameId, MANAGE);
    },
    execute: async (ctx, rawPlan) => {
      const plan = parsePlan(targetPlanSchema, rawPlan);
      await loadRosterGame(plan.gameId);
      // `gameController.acceptJoinQueue`: (id, req.userId, body.userId).
      await ParticipantService.acceptNonPlayingParticipant(plan.gameId, ctx.principal.userId, plan.playerId);
      return resultFor(ctx, plan.gameId, plan.playerId, agentRosterT(ctx.locale, 'result.accepted'));
    },
  },
});

/** `declineNonPlayingParticipant` only accepts an owner/admin row on this very game (no parent, no platform-admin bypass). */
async function assertMayDecline(principal: Pick<AgentPrincipal, 'userId'>, gameId: string): Promise<void> {
  const [game, mine] = await Promise.all([
    prisma.game.findUnique({ where: { id: gameId }, select: { id: true } }),
    prisma.gameParticipant.findFirst({ where: { gameId, userId: principal.userId }, select: { role: true } }),
  ]);
  if (!game) throw new ApiError(404, 'Game not found');
  if (!canUserManageQueue(mine)) throw new ApiError(403, 'games.notAuthorizedToDeclineJoinQueue');
}

export const declineFromQueueTool = defineTool({
  name: 'decline_from_queue',
  description:
    "Prepare declining a player's request in a game's join queue (owner or game admin of the game). Creates a confirmation card; nothing changes until the user confirms.",
  kind: 'write',
  riskTier: 'standard',
  scope: 'user',
  input: targetInput,
  label: (_args, locale) => agentRosterT(locale, 'label.declineFromQueue'),
  handler: async (ctx, args) => {
    const { principal, locale } = ctx;
    await guard(principal, args.gameId, MANAGE);
    const game = await loadRosterGame(args.gameId);
    await assertMayDecline(principal, game.id);
    const target = await loadTarget(game.id, args.playerId, ParticipantStatus.IN_QUEUE);
    const name = agentUserDisplayName(target.user);
    const isOwner = target.role === ParticipantRole.OWNER;
    const preview = buildPreview(
      ctx,
      game,
      agentRosterT(locale, 'preview.decline.title', { name, game: gameName(game) }),
      [
        line(agentRosterT(locale, 'field.player'), null, name),
        line(
          agentRosterT(locale, 'field.place'),
          agentT(locale, 'value.queue'),
          isOwner ? agentT(locale, 'value.organizer') : agentT(locale, 'value.notOnRoster'),
        ),
      ],
      isOwner ? [] : [agentRosterT(locale, 'warn.playerNotified', { name })],
    );
    const plan: z.infer<typeof targetPlanSchema> = { gameId: game.id, playerId: target.user.id };
    return proposeAgentAction(ctx, { toolName: 'decline_from_queue', input: args, plan, preview });
  },
  confirm: {
    authorize: async (principal, rawPlan) => {
      const plan = parsePlan(targetPlanSchema, rawPlan);
      await guard(principal, plan.gameId, MANAGE);
      await assertMayDecline(principal, plan.gameId);
    },
    execute: async (ctx, rawPlan) => {
      const plan = parsePlan(targetPlanSchema, rawPlan);
      await loadRosterGame(plan.gameId);
      // `gameController.declineJoinQueue`: (id, req.userId, body.userId).
      await ParticipantService.declineNonPlayingParticipant(plan.gameId, ctx.principal.userId, plan.playerId);
      return resultFor(ctx, plan.gameId, plan.playerId, agentRosterT(ctx.locale, 'result.queueDeclined'));
    },
  },
});

// --- set_trainer (POST /games/:id/set-trainer) -----------------------------------------------

const setTrainerInput = z
  .object({
    gameId: ID,
    playerId: ID.nullable().describe('The new trainer (user id from the get_game roster), or null to remove the trainer'),
  })
  .strict();
/** Exactly the `POST /set-trainer` body: `{userId, isTrainer}`. */
const setTrainerPlanSchema = z.object({ gameId: z.string(), playerId: z.string(), isTrainer: z.boolean() }).strict();

/** `AdminService.setTrainer`: TRAINING only, and only the owner row of this game (no parent / platform-admin bypass). */
async function assertMaySetTrainer(principal: Pick<AgentPrincipal, 'userId'>, gameId: string) {
  const game = await prisma.game.findUnique({ where: { id: gameId }, select: { entityType: true, trainerId: true } });
  if (!game || game.entityType !== EntityType.TRAINING) throw new ApiError(400, 'Only training games can have a trainer');
  const owner = await prisma.gameParticipant.findFirst({
    where: { gameId, userId: principal.userId, role: ParticipantRole.OWNER },
    select: { id: true },
  });
  if (!owner) throw new ApiError(403, 'Only the owner can set the trainer');
  return game;
}

export const setTrainerTool = defineTool({
  name: 'set_trainer',
  description:
    'Prepare setting the trainer of a training the user owns (a player already on its roster), or removing the trainer with playerId null. Creates a confirmation card; nothing changes until the user confirms.',
  kind: 'write',
  riskTier: 'standard',
  scope: 'user',
  input: setTrainerInput,
  label: (_args, locale) => agentRosterT(locale, 'label.setTrainer'),
  handler: async (ctx, args) => {
    const { principal, locale } = ctx;
    await guard(principal, args.gameId, OWNER);
    const game = await loadRosterGame(args.gameId);
    const { trainerId } = await assertMaySetTrainer(principal, game.id);
    const current = trainerId ? await loadTarget(game.id, trainerId).catch(() => null) : null;
    const noTrainer = agentRosterT(locale, 'value.noTrainer');
    const warnings: string[] = [];
    let plan: z.infer<typeof setTrainerPlanSchema>;
    let to: string;
    if (args.playerId === null) {
      if (!trainerId) throw new ApiError(400, 'This training has no trainer');
      if (!current) throw new ApiError(404, 'User is not a participant of this game');
      plan = { gameId: game.id, playerId: trainerId, isTrainer: false };
      to = noTrainer;
    } else {
      if (args.playerId === trainerId) throw new ApiError(400, 'Already the trainer of this training');
      const target = await loadTarget(game.id, args.playerId);
      // `setTrainer` makes the trainer an ADMIN; on the owner's row that would drop the owner.
      if (target.role === ParticipantRole.OWNER) throw new ApiError(400, 'The organizer cannot be made the trainer here; use the app');
      if (!ON_ROSTER.includes(target.status)) throw new ApiError(400, 'Only players on the roster can become the trainer');
      const name = agentUserDisplayName(target.user);
      if (target.status === ParticipantStatus.PLAYING) warnings.push(agentRosterT(locale, 'warn.trainerNoSeat', { name }));
      if (current) warnings.push(agentRosterT(locale, 'warn.previousTrainer', { name: agentUserDisplayName(current.user) }));
      plan = { gameId: game.id, playerId: target.user.id, isTrainer: true };
      to = name;
    }
    const preview = buildPreview(
      ctx,
      game,
      agentRosterT(locale, 'preview.trainer.title', { game: gameName(game) }),
      [line(agentRosterT(locale, 'field.trainer'), current ? agentUserDisplayName(current.user) : noTrainer, to)],
      warnings,
    );
    return proposeAgentAction(ctx, { toolName: 'set_trainer', input: args, plan, preview });
  },
  confirm: {
    authorize: async (principal, rawPlan) => {
      const plan = parsePlan(setTrainerPlanSchema, rawPlan);
      await guard(principal, plan.gameId, OWNER);
      await assertMaySetTrainer(principal, plan.gameId);
    },
    execute: async (ctx, rawPlan) => {
      const plan = parsePlan(setTrainerPlanSchema, rawPlan);
      await loadRosterGame(plan.gameId);
      if (plan.isTrainer) {
        const target = await loadTarget(plan.gameId, plan.playerId);
        if (target.role === ParticipantRole.OWNER) throw new ApiError(400, 'The organizer cannot be made the trainer here; use the app');
      }
      // `gameController.setTrainer`: (id, req.userId, body.userId, body.isTrainer === true).
      await AdminService.setTrainer(plan.gameId, ctx.principal.userId, plan.playerId, plan.isTrainer);
      return resultFor(ctx, plan.gameId, plan.playerId, agentRosterT(ctx.locale, plan.isTrainer ? 'result.trainerSet' : 'result.trainerRemoved'));
    },
  },
});

export const ROSTER_TOOLS = [removeParticipantTool, setGameAdminTool, acceptFromQueueTool, declineFromQueueTool, setTrainerTool];
