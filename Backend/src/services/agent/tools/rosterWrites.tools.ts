/**
 * Roster write tools `join_game` / `leave_game` (phase 3b), for the user themselves only;
 * matrix-tested in `agentWrite.integration.test.ts`. Same propose/confirm shape as
 * `gameWrites.tools.ts`; confirm runs the same branches as `POST /games/:id/join|leave`.
 */
import { EntityType, ParticipantRole, ParticipantStatus } from '@prisma/client';
import { z } from 'zod/v4';
import type { AgentActionPreview, AgentActionPreviewLine } from '@bandeja/shared/agentContract';
import { isGameArchived, isGameResultsLocked } from '@bandeja/shared/gameMutationLock';
import { ApiError } from '../../../utils/ApiError';
import { validateGameCanAcceptParticipants } from '../../../utils/participantValidation';
import { EventRsvpService } from '../../game/eventRsvp.service';
import { ParticipantService } from '../../game/participant.service';
import { assertAgentCanViewGame } from '../access/agentGameAccess';
import { proposeAgentAction } from '../agentActionPropose';
import { agentGameTitle } from '../dto/game.dto';
import { agentT } from '../i18n/agentI18n';
import { defineTool, type AgentToolContext } from './registry';
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

// --- join_game / leave_game ------------------------------------------------------------------

const gameIdInput = z.object({ gameId: ID }).strict();
const rosterPlanSchema = z.object({ gameId: z.string(), confirmOverlap: z.boolean() }).strict();


function placeLabel(
  locale: string,
  row: { role: ParticipantRole; status: ParticipantStatus } | null,
  entityType: EntityType,
): string {
  if (!row) return agentT(locale, 'value.notOnRoster');
  if (entityType === EntityType.EVENT) return agentT(locale, 'value.going');
  if (row.status === ParticipantStatus.PLAYING) return agentT(locale, 'value.player');
  if (row.status === ParticipantStatus.IN_QUEUE) return agentT(locale, 'value.queue');
  if (row.status === ParticipantStatus.INVITED) return agentT(locale, 'value.invited');
  if (row.role === ParticipantRole.OWNER) return agentT(locale, 'value.organizer');
  return agentT(locale, 'value.notOnRoster');
}

function rosterPreviewLines(ctx: AgentToolContext, game: GameWriteRow, timezone: string): AgentActionPreviewLine[] {
  const { locale } = ctx;
  return [
    line(agentT(locale, 'field.when'), null, when(game, timezone, locale)),
    ...(game.club ? [line(agentT(locale, 'field.club'), null, game.club.name)] : []),
    ...(game.entityType === EntityType.EVENT
      ? []
      : [line(agentT(locale, 'field.players'), null, `${game._count.participants}/${game.maxParticipants}`)]),
  ];
}

type JoinForecast =
  | Awaited<ReturnType<typeof ParticipantService.predictJoinOutcome>>
  | { outcome: 'unknown'; reason?: undefined };

/** `ParticipantService.predictJoinOutcome`, or `unknown` when it can't tell (card says "player or queue"). */
async function forecastJoin(gameId: string, userId: string): Promise<JoinForecast> {
  try {
    return await ParticipantService.predictJoinOutcome(gameId, userId);
  } catch (error) {
    console.error('[agent] join forecast failed', { gameId, error });
    return { outcome: 'unknown' };
  }
}

const REFUSAL_TEXT: Record<string, string> = {
  'spots.queue.waitForOrganizer': 'You are already in the join queue; the organizer has to accept you',
  'games.alreadyInJoinQueue': 'You are already in the join queue and no seat is free for you',
  'errors.games.cannotAddPlayer': 'You cannot be added to this game',
};

function refusalText(reason: string | undefined): string {
  if (!reason) return 'You cannot join this game';
  return REFUSAL_TEXT[reason] ?? reason;
}

export const joinGameTool = defineTool({
  name: 'join_game',
  description:
    "Prepare joining a game as a player for the user (or joining its queue when it's full or needs organizer approval; 'going' for events). Creates a confirmation card; nothing changes until the user confirms.",
  kind: 'write',
  riskTier: 'standard',
  scope: 'user',
  promptHint: 'join a game for the user themselves',
  input: gameIdInput,
  label: (_args, locale) => agentT(locale, 'label.joinGame'),
  handler: async (ctx, args) => {
    const { principal, locale } = ctx;
    await assertAgentCanViewGame(principal, args.gameId);
    const game = await loadGameForWrite(args.gameId);
    assertRosterToolSupported(game);
    // Same gate `joinGame` applies (archived / results started → 400).
    validateGameCanAcceptParticipants(game);
    const mine = await myParticipant(game.id, principal.userId);
    const isEvent = game.entityType === EntityType.EVENT;
    if ((isEvent && mine) || mine?.status === ParticipantStatus.PLAYING) {
      throw new ApiError(400, 'Already joined this game');
    }
    const timezone = gameTimezone(game, ctx.timezone);
    const warnings: string[] = [];
    // The card promises what `joinGame` will do: same branches, same predicates.
    const forecast = isEvent ? null : await forecastJoin(game.id, principal.userId);
    if (forecast?.outcome === 'refused') throw new ApiError(400, refusalText(forecast.reason));
    if (forecast?.outcome === 'queue') {
      warnings.push(
        agentT(
          locale,
          !game.allowDirectJoin
            ? 'warn.queueApproval'
            : forecast.reason === 'games.addedToQueueLevelOutOfRange'
              ? 'warn.queueLevel'
              : 'warn.queueFull',
        ),
      );
    }
    const willPlay = forecast?.outcome === 'player';
    if (game.timeIsSet && game.startTime.getTime() < ctx.now.getTime()) warnings.push(agentT(locale, 'warn.past'));
    let overlap: string | null = null;
    if (willPlay || forecast?.outcome === 'unknown') {
      overlap = await overlapWarning(principal.userId, game, timezone, locale);
      if (overlap) warnings.push(overlap);
    }
    const to = isEvent
      ? agentT(locale, 'value.going')
      : willPlay
        ? agentT(locale, 'value.player')
        : forecast?.outcome === 'queue'
          ? agentT(locale, 'value.queue')
          : agentT(locale, 'value.playerOrQueue');
    const title = agentGameTitle(game);
    const preview: AgentActionPreview = {
      title: agentT(locale, 'preview.join.title', { game: clip(title, 60) ?? title }),
      lines: [
        ...rosterPreviewLines(ctx, game, timezone),
        line(agentT(locale, 'field.yourPlace'), placeLabel(locale, mine, game.entityType), to),
      ],
      warnings,
    };
    // The card showed the overlap; confirming it is the app's "join anyway".
    const plan: z.infer<typeof rosterPlanSchema> = { gameId: game.id, confirmOverlap: overlap != null };
    return proposeAgentAction(ctx, { toolName: 'join_game', input: args, plan, preview });
  },
  confirm: {
    authorize: async (principal, rawPlan) => {
      const plan = parsePlan(rosterPlanSchema, rawPlan);
      await assertAgentCanViewGame(principal, plan.gameId);
    },
    execute: async (ctx, rawPlan) => {
      const plan = parsePlan(rosterPlanSchema, rawPlan);
      const game = await loadGameForWrite(plan.gameId);
      assertRosterToolSupported(game);
      const userId = ctx.principal.userId;
      // Same branches as `POST /games/:id/join` (`game.controller.ts` joinGame).
      if (game.entityType === EntityType.EVENT) {
        await EventRsvpService.setIntent(plan.gameId, userId, 'going');
      } else {
        await ParticipantService.joinGame(plan.gameId, userId, plan.confirmOverlap);
      }
      const mine = await myParticipant(plan.gameId, userId);
      const queued = mine?.status === ParticipantStatus.IN_QUEUE;
      return {
        message: agentT(ctx.locale, queued ? 'result.queued' : 'result.joined'),
        entities: await gameEntityFor(plan.gameId, userId),
        modelData: { gameId: plan.gameId, myStatus: mine?.status ?? null },
      };
    },
  },
});

export const leaveGameTool = defineTool({
  name: 'leave_game',
  description:
    "Prepare leaving a game (or its queue) for the user. An organizer who plays stays organizer but stops playing. Creates a confirmation card; nothing changes until the user confirms.",
  kind: 'write',
  riskTier: 'standard',
  scope: 'user',
  promptHint: 'leave a game for the user themselves',
  input: gameIdInput,
  label: (_args, locale) => agentT(locale, 'label.leaveGame'),
  handler: async (ctx, args) => {
    const { principal, locale } = ctx;
    await assertAgentCanViewGame(principal, args.gameId);
    const game = await loadGameForWrite(args.gameId);
    assertRosterToolSupported(game);
    const mine = await myParticipant(game.id, principal.userId);
    if (!mine) throw new ApiError(400, 'Not a participant of this game');
    const isOwner = mine.role === ParticipantRole.OWNER;
    if (isOwner && mine.status !== ParticipantStatus.PLAYING && game.entityType !== EntityType.EVENT) {
      throw new ApiError(400, 'The organizer cannot leave the game; delete it in the app instead');
    }
    if (isGameArchived(game)) throw new ApiError(400, 'errors.games.cannotEditArchived');
    // Same rule as `leaveGame`: a playing seat carries results once entry has started.
    if (mine.status === ParticipantStatus.PLAYING && isGameResultsLocked(game)) {
      throw new ApiError(400, 'errors.games.cannotLeaveResultsStarted');
    }
    const timezone = gameTimezone(game, ctx.timezone);
    const warnings: string[] = [];
    if (isOwner && game.entityType !== EntityType.EVENT) warnings.push(agentT(locale, 'warn.ownerStays'));
    const to =
      isOwner && game.entityType !== EntityType.EVENT
        ? agentT(locale, 'value.organizer')
        : agentT(locale, 'value.notOnRoster');
    const title = agentGameTitle(game);
    const preview: AgentActionPreview = {
      title: agentT(locale, 'preview.leave.title', { game: clip(title, 60) ?? title }),
      lines: [
        ...rosterPreviewLines(ctx, game, timezone),
        line(agentT(locale, 'field.yourPlace'), placeLabel(locale, mine, game.entityType), to),
      ],
      warnings,
    };
    const plan: z.infer<typeof rosterPlanSchema> = { gameId: game.id, confirmOverlap: false };
    return proposeAgentAction(ctx, { toolName: 'leave_game', input: args, plan, preview });
  },
  confirm: {
    authorize: async (principal, rawPlan) => {
      const plan = parsePlan(rosterPlanSchema, rawPlan);
      await assertAgentCanViewGame(principal, plan.gameId);
    },
    execute: async (ctx, rawPlan) => {
      const plan = parsePlan(rosterPlanSchema, rawPlan);
      const game = await loadGameForWrite(plan.gameId);
      assertRosterToolSupported(game);
      const userId = ctx.principal.userId;
      // Same branches as `POST /games/:id/leave` (`game.controller.ts` leaveGame).
      if (game.entityType === EntityType.EVENT) {
        await EventRsvpService.leave(plan.gameId, userId);
      } else {
        await ParticipantService.leaveGame(plan.gameId, userId);
      }
      const mine = await myParticipant(plan.gameId, userId);
      return {
        message: agentT(ctx.locale, 'result.left'),
        entities: await gameEntityFor(plan.gameId, userId),
        modelData: { gameId: plan.gameId, myStatus: mine?.status ?? null },
      };
    },
  },
});

export const ROSTER_WRITE_TOOLS = [joinGameTool, leaveGameTool];
