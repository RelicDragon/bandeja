/**
 * League-owner write tools (phase 4a): `reschedule_league_fixture`,
 * `send_league_round_start_message`. Same pattern as `gameWrites.tools.ts`: validate
 * (zod `.strict()`), guard, render a preview, propose; `confirm.authorize` re-runs the
 * guard with a fresh principal and `confirm.execute` calls the service the HTTP route uses.
 *
 * Guard (both tools): owner/admin of the **season** (parent), via
 * `assertAgentGamePermission(season, [OWNER, ADMIN])` — league content is visible to
 * everyone (leagues are for everyone), so a stranger gets 403 (not 404) even on a private
 * season; a missing id is 404; a fixture-only OWNER/ADMIN row is not enough. Out of scope on purpose (constraints):
 * scores / results, playoff seeding and bracket formats, season format.
 */
import { EntityType, ParticipantRole, ParticipantStatus } from '@prisma/client';
import { z } from 'zod/v4';
import type { AgentActionPreview } from '@bandeja/shared/agentContract';
import prisma from '../../../config/database';
import { ApiError } from '../../../utils/ApiError';
import { assertGamePermission } from '../../game/gamePermission';
import { GameUpdateService } from '../../game/update.service';
import { GameCourtService } from '../../gameCourt/gameCourt.service';
import { LeagueBroadcastService } from '../../league/broadcast.service';
import type { AgentPrincipal } from '../access/agentPrincipal';
import { agentGameNotFound, assertAgentCanViewGame, assertAgentGamePermission } from '../access/agentGameAccess';
import { proposeAgentAction } from '../agentActionPropose';
import { agentT } from '../i18n/agentI18n';
import { agentLeagueT } from '../i18n/agentLeagueI18n';
import { loadVisibleLeagueSeason } from './leagueSchedule.tools';
import {
  buildFixtureChange,
  buildRoundStartPreview,
  FIXTURE_WRITE_SELECT,
  fixtureTitle,
  roundAnnouncementFacts,
  type FixtureWriteRow,
} from './leagueWritePreview';
import { defineTool } from './registry';
import { gameEntityFor, myParticipant, overlapWarning, parsePlan } from './writeHelpers';

const ID = z.string().min(1).max(64);
const SEASON_ROLES: ParticipantRole[] = [ParticipantRole.OWNER, ParticipantRole.ADMIN];
const SCHEDULE_KEYS = ['startTime', 'endTime', 'clubId', 'courtId'];

// --- guards ----------------------------------------------------------------------------------

/**
 * Fixture edit guard, identical at propose and confirm time:
 *   1. fixture visible to the agent (else 404);
 *   2. a real LEAGUE fixture under a LEAGUE_SEASON (else 400, nothing hidden: it's visible);
 *   3. season owner/admin (`assertAgentGamePermission` on the parent: league content is
 *      always visible, so no role → 403; archived season 400);
 *   4. the fixture itself not archived and results not started (`requireRosterMutable`),
 *      so nothing here can race a score write.
 */
async function assertCanEditFixture(principal: AgentPrincipal, fixtureId: string): Promise<{ seasonId: string }> {
  await assertAgentCanViewGame(principal, fixtureId);
  const row = await prisma.game.findUnique({
    where: { id: fixtureId },
    select: { entityType: true, parentId: true, parent: { select: { entityType: true } } },
  });
  if (!row) throw agentGameNotFound();
  if (row.entityType !== EntityType.LEAGUE || !row.parentId || row.parent?.entityType !== EntityType.LEAGUE_SEASON) {
    throw new ApiError(400, 'Not a league fixture: use get_league_schedule for fixture ids (update_game edits casual games)');
  }
  await assertAgentGamePermission(principal, row.parentId, SEASON_ROLES);
  await assertGamePermission(principal, fixtureId, SEASON_ROLES, { requireRosterMutable: true });
  return { seasonId: row.parentId };
}

async function loadFixtureForWrite(fixtureId: string): Promise<FixtureWriteRow> {
  const fixture = await prisma.game.findUnique({ where: { id: fixtureId }, select: FIXTURE_WRITE_SELECT });
  if (!fixture) throw agentGameNotFound();
  return fixture;
}

/** Refusals that must hold at propose AND confirm time (bookings can be linked in between). */
function assertFixtureScheduleEditable(fixture: Pick<FixtureWriteRow, '_count'>, body: Record<string, unknown>): void {
  const touchesSchedule = SCHEDULE_KEYS.some((key) => key in body);
  if (touchesSchedule && fixture._count.externalBookings > 0) {
    throw new ApiError(400, 'This fixture is linked to court bookings; change its time and place in the app');
  }
  if (('clubId' in body || 'courtId' in body) && fixture._count.gameCourts > 1) {
    throw new ApiError(400, 'This fixture uses several courts; change the courts in the app');
  }
}

/** Round announce guard: a missing round and a hidden season give the same 404. */
async function assertCanAnnounceRound(principal: AgentPrincipal, roundId: string): Promise<{ seasonId: string }> {
  const round = await prisma.leagueRound.findUnique({ where: { id: roundId }, select: { leagueSeasonId: true } });
  if (!round) throw agentGameNotFound();
  await assertAgentGamePermission(principal, round.leagueSeasonId, SEASON_ROLES);
  return { seasonId: round.leagueSeasonId };
}

// --- reschedule_league_fixture ---------------------------------------------------------------

const rescheduleInput = z
  .object({
    fixtureId: ID.describe('League fixture id from get_league_schedule'),
    startTime: z.string().max(40).optional().describe('New start: YYYY-MM-DDTHH:mm (club city time) or ISO date-time'),
    endTime: z.string().max(40).optional().describe('New end; when only startTime is given the duration is kept (90 min if the fixture had no time)'),
    clubId: ID.optional().describe('Club id from search_clubs'),
    courtId: ID.nullable().optional().describe('Court id from get_club (a court at another club moves the fixture there), or null for no court'),
  })
  .strict()
  .refine(
    (args) => SCHEDULE_KEYS.some((key) => (args as Record<string, unknown>)[key] !== undefined),
    'give at least one of startTime, endTime, clubId, courtId',
  );

const reschedulePlanSchema = z
  .object({
    fixtureId: z.string(),
    /** Exactly the `PUT /games/:id` body the league fixture editor would send. */
    body: z.record(z.string(), z.unknown()),
    syncGameCourts: z.boolean(),
  })
  .strict();

export const rescheduleLeagueFixtureTool = defineTool({
  name: 'reschedule_league_fixture',
  description:
    'Prepare a change to a league fixture of a season the user owns or admins: new date/time and/or club and court (also to assign a court). Never changes scores, teams or the season format. Creates a confirmation card; nothing changes until the user confirms. Times are in the club city timezone.',
  kind: 'write',
  riskTier: 'standard',
  scope: 'user',
  promptHint: 'change the date, time, club or court of a fixture in a league season the user owns or admins (never scores, teams or format)',
  input: rescheduleInput,
  label: (_args, locale) => agentLeagueT(locale, 'label.rescheduleFixture'),
  handler: async (ctx, args) => {
    const { principal, locale } = ctx;
    await assertCanEditFixture(principal, args.fixtureId);
    const fixture = await loadFixtureForWrite(args.fixtureId);
    const change = await buildFixtureChange(fixture, args, locale, ctx.timezone, ctx.now);
    if (Object.keys(change.body).length === 0) {
      throw new ApiError(400, 'Nothing to change: the fixture already has these values');
    }
    assertFixtureScheduleEditable(fixture, change.body);

    const warnings = [...change.warnings];
    if (['startTime', 'clubId'].some((key) => key in change.body)) {
      const others = await prisma.gameParticipant.count({
        where: { gameId: fixture.id, status: ParticipantStatus.PLAYING, userId: { not: principal.userId } },
      });
      if (others > 0) warnings.push(agentT(locale, 'warn.notify', { count: others }));
      const mine = await myParticipant(fixture.id, principal.userId);
      if ('startTime' in change.body && mine?.status === ParticipantStatus.PLAYING) {
        const overlap = await overlapWarning(
          principal.userId,
          { id: fixture.id, startTime: change.nextStart, endTime: change.nextEnd, timeIsSet: true },
          ctx.timezone,
          locale,
        );
        if (overlap) warnings.push(overlap);
      }
    }
    const preview: AgentActionPreview = { title: fixtureTitle(fixture, locale), lines: change.lines, warnings };
    const plan: z.infer<typeof reschedulePlanSchema> = {
      fixtureId: fixture.id,
      body: change.body,
      syncGameCourts: 'clubId' in change.body || 'courtId' in change.body,
    };
    return proposeAgentAction(ctx, { toolName: 'reschedule_league_fixture', input: args, plan, preview });
  },
  confirm: {
    authorize: async (principal, rawPlan) => {
      const plan = parsePlan(reschedulePlanSchema, rawPlan);
      await assertCanEditFixture(principal, plan.fixtureId);
    },
    execute: async (ctx, rawPlan) => {
      const plan = parsePlan(reschedulePlanSchema, rawPlan);
      const fixture = await loadFixtureForWrite(plan.fixtureId);
      assertFixtureScheduleEditable(fixture, plan.body);
      // `PUT /games/:id` (no route middleware; the service re-checks parent permission and locks).
      await GameUpdateService.updateGame(plan.fixtureId, { ...plan.body }, ctx.principal.userId, ctx.principal.isAdmin);
      if (plan.syncGameCourts) {
        const [updated, courts] = await Promise.all([
          prisma.game.findUnique({ where: { id: plan.fixtureId }, select: { courtId: true } }),
          prisma.gameCourt.findMany({ where: { gameId: plan.fixtureId }, select: { courtId: true } }),
        ]);
        const wanted = updated?.courtId ? [updated.courtId] : [];
        if (courts.length <= 1 && courts.map((c) => c.courtId).join(',') !== wanted.join(',')) {
          await GameCourtService.setGameCourts(plan.fixtureId, wanted);
        }
      }
      const after = await prisma.game.findUniqueOrThrow({
        where: { id: plan.fixtureId },
        select: { startTime: true, endTime: true, timeIsSet: true, clubId: true, courtId: true },
      });
      return {
        message: agentLeagueT(ctx.locale, 'result.fixtureUpdated'),
        entities: await gameEntityFor(plan.fixtureId, ctx.principal.userId),
        modelData: {
          fixtureId: plan.fixtureId,
          startTime: after.timeIsSet ? after.startTime.toISOString() : null,
          endTime: after.timeIsSet ? after.endTime.toISOString() : null,
          clubId: after.clubId,
          courtId: after.courtId,
        },
      };
    },
  },
});

// --- send_league_round_start_message ---------------------------------------------------------

const roundStartInput = z
  .object({ roundId: ID.describe('League round id from get_league_schedule (rounds list)') })
  .strict();

const roundStartPlanSchema = z.object({ roundId: z.string() }).strict();

export const sendLeagueRoundStartMessageTool = defineTool({
  name: 'send_league_round_start_message',
  description:
    "Prepare the round start announcement of a league season the user owns or admins: every player of the round's fixtures gets the app's round-start notification (time, club, opponents). Can be sent once per round. Creates a confirmation card; nothing is sent until the user confirms.",
  kind: 'write',
  riskTier: 'critical',
  scope: 'user',
  promptHint: 'send the round-start announcement to the players of a round in a league season the user owns or admins (once per round)',
  input: roundStartInput,
  label: (_args, locale) => agentLeagueT(locale, 'label.roundStartMessage'),
  handler: async (ctx, args) => {
    const { principal, locale } = ctx;
    const { seasonId } = await assertCanAnnounceRound(principal, args.roundId);
    const facts = await roundAnnouncementFacts(args.roundId);
    if (facts.round.sentStartMessage) throw new ApiError(400, 'Start message already sent for this round');
    if (facts.fixtures === 0) throw new ApiError(400, 'This round has no fixtures yet');
    if (facts.recipients === 0) throw new ApiError(400, 'Nobody plays in this round yet');
    const { title } = await loadVisibleLeagueSeason(principal, seasonId);
    const preview = buildRoundStartPreview({ seasonTitle: title, ...facts }, locale);
    const plan: z.infer<typeof roundStartPlanSchema> = { roundId: args.roundId };
    return proposeAgentAction(ctx, { toolName: 'send_league_round_start_message', input: args, plan, preview });
  },
  confirm: {
    authorize: async (principal, rawPlan) => {
      const plan = parsePlan(roundStartPlanSchema, rawPlan);
      await assertCanAnnounceRound(principal, plan.roundId);
    },
    execute: async (ctx, rawPlan) => {
      const plan = parsePlan(roundStartPlanSchema, rawPlan);
      const { seasonId } = await assertCanAnnounceRound(ctx.principal, plan.roundId);
      // `POST /leagues/rounds/:id/send-start-message` (no route middleware; the service
      // re-checks season owner/admin and refuses a second send).
      const result = await LeagueBroadcastService.broadcastRoundStartMessage(plan.roundId, ctx.principal.userId, ctx.principal.isAdmin);
      const { title } = await loadVisibleLeagueSeason(ctx.principal, seasonId);
      return {
        message: agentLeagueT(ctx.locale, 'result.roundAnnounced', { count: result.notifiedUsers }),
        entities: [{ type: 'league_season', id: seasonId, title }],
        modelData: { roundId: plan.roundId, seasonId, notifiedUsers: result.notifiedUsers },
      };
    },
  },
});

export const LEAGUE_WRITE_TOOLS = [rescheduleLeagueFixtureTool, sendLeagueRoundStartMessageTool];
