/**
 * Results tools (slice 9b, docs/plans/ai-agent.md §16.2, docs/domains/results.md):
 *   - `get_game_results` (read): the board of a game the agent may show (hidden → 404, and
 *     the HTTP results read rule `assertCanReadGameResults` on top).
 *   - `enter_match_score` (write, standard): the board's manual match PUT
 *     (`resultsService.updateMatch`) with the optimistic `baseVersion` captured when the card
 *     is made. On a game without results it first runs the board's "start results" step
 *     (`startResultsEntryWithGeneratedRound`, HANDMADE formats only: one match).
 *   - `finish_results` (write, critical): the board's Finish (`recalculateGameOutcomes`,
 *     `POST /results/game/:id/recalculate`). IN_PROGRESS → FINAL; ratings and bets follow.
 *
 * Guard for the writes: agent visibility (hidden → 404) then `canModifyResults`, the exact
 * rule behind `requireCanModifyResults` (owner/admin incl. parent season roles, or
 * `resultsByAnyone` + PLAYING participant; archived → 403). Players never come from the
 * model unchecked: a match's existing lineup is used as is, and a lineup for an empty match
 * must be PLAYING participants of the game (fixed teams: exactly one fixed team per side).
 * Reset and edit-FINAL are not tools: the model hands off to `/games/:id`.
 */
import { EntityType, MatchGenerationType, MatchSetRole, ParticipantStatus } from '@prisma/client';
import { z } from 'zod/v4';
import type { AgentActionPreview, AgentActionPreviewLine, AgentEntityRef } from '@bandeja/shared/agentContract';
import prisma from '../../../config/database';
import { ApiError } from '../../../utils/ApiError';
import { canModifyResults } from '../../../utils/parentGamePermissions';
import { maxPlayersPerTeamForGame } from '../../../shared/matchFormat';
import * as resultsService from '../../results.service';
import { assertCanReadGameResults } from '../../results/gameResultsAccess';
import { getStandingsMatchOutcome } from '../../results/liveScoringEngine/matchWinnerLive';
import { getRules } from '../../results/liveScoringEngine/rulebook';
import { notifyMatchLiveScoringCleared } from '../../results/matchLiveScoring.service';
import { assertMatchNormalizedSetsValid, type NormalizedMatchSetRow } from '../../results/matchSetsValidation';
import { recalculateGameOutcomes } from '../../results/outcomes.service';
import { startResultsEntryWithGeneratedRound } from '../../results/roundGeneration.service';
import type { AgentPrincipal } from '../access/agentPrincipal';
import { assertAgentCanViewGame } from '../access/agentGameAccess';
import { proposeAgentAction } from '../agentActionPropose';
import { agentGameTitle } from '../dto/game.dto';
import { agentUserDisplayName } from '../dto/user.dto';
import { agentResultsT, type AgentResultsI18nKey } from '../i18n/agentResultsI18n';
import type { AgentToolContext, AgentToolResult, AgentWriteContext, AgentWriteOutcome } from './registry';
import { defineTool } from './registry';
import { clip, gameEntityFor, line, loadGameForWrite, parsePlan } from './writeHelpers';

const ID = z.string().min(1).max(64);
/** Results entry is refused for these (docs/domains/results.md "Entry"). */
export const RESULTS_FORBIDDEN_ENTITY_TYPES: EntityType[] = [
  EntityType.EVENT,
  EntityType.BAR,
  EntityType.TRAINING,
  EntityType.LEAGUE_SEASON,
];
const MAX_MATCHES_LISTED = 60;
const MAX_STANDINGS_LISTED = 32;
const MAX_REFS_SHOWN = 4;
/** Same cap as the match PUT (`SUPPLEMENTAL_SET_SCORE_MAX`). */
const SCORE_MAX = 9999;

export const gameHandoffUrl = (gameId: string): string => `/games/${gameId}`;

// --- board ----------------------------------------------------------------------------------

type BoardUser = { id: string; firstName: string | null; lastName: string | null };
type BoardMatch = {
  id: string;
  matchNumber: number;
  resultsVersion: string;
  metadata: unknown;
  sets: Array<{ setNumber: number; teamAScore: number; teamBScore: number; isTieBreak: boolean; role: MatchSetRole }>;
  teams: Array<{ teamNumber: number; players: Array<{ userId: string; createdAt: Date; user: BoardUser }> }>;
};
type Board = Parameters<typeof getRules>[0] & {
  id: string;
  entityType: EntityType;
  resultsStatus: 'NONE' | 'IN_PROGRESS' | 'FINAL';
  status: string;
  sport: string;
  playersPerMatch: number | null;
  hasFixedTeams: boolean;
  affectsRating: boolean;
  matchGenerationType: MatchGenerationType | null;
  resultsVersion: string;
  rounds: Array<{ id: string; roundNumber: number; matches: BoardMatch[] }>;
  outcomes: Array<{
    userId: string;
    position: number | null;
    isWinner: boolean;
    wins: number;
    ties: number;
    losses: number;
    pointsEarned: number;
    levelChange: number;
    user: BoardUser;
  }>;
};

/** The payload `GET /results/game/:id` serves (same projection, same `resultsVersion`s). */
async function loadBoard(gameId: string): Promise<Board> {
  return (await resultsService.getGameResults(gameId)) as unknown as Board;
}

type FlatMatch = { match: BoardMatch; roundNumber: number; matchNumber: number };

function flatMatches(board: Board): FlatMatch[] {
  return board.rounds.flatMap((round, roundIndex) =>
    round.matches.map((match, matchIndex) => ({ match, roundNumber: roundIndex + 1, matchNumber: matchIndex + 1 })),
  );
}

function sidePlayers(match: BoardMatch, teamNumber: 1 | 2) {
  const team = match.teams.find((t) => t.teamNumber === teamNumber);
  return [...(team?.players ?? [])].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function officialSets(sets: Array<{ teamA: number; teamB: number; isTieBreak?: boolean; role?: string }>) {
  return sets.map((s) => ({ teamA: s.teamA, teamB: s.teamB, isTieBreak: Boolean(s.isTieBreak), role: s.role ?? 'OFFICIAL' }));
}

function boardSets(match: BoardMatch) {
  return [...match.sets]
    .sort((a, b) => a.setNumber - b.setNumber)
    .map((s) => ({ teamA: s.teamAScore, teamB: s.teamBScore, isTieBreak: s.isTieBreak, role: s.role as string }));
}

type Outcome = 'teamA' | 'teamB' | 'tie' | null;

function matchOutcome(sets: ReturnType<typeof boardSets>, board: Board): Outcome {
  const outcome = getStandingsMatchOutcome(officialSets(sets), getRules(board));
  return outcome === 'A' ? 'teamA' : outcome === 'B' ? 'teamB' : outcome === 'tie' ? 'tie' : null;
}

function formatScore(sets: Array<{ teamA: number; teamB: number }>): string | null {
  const played = sets.filter((s) => s.teamA > 0 || s.teamB > 0);
  return played.length ? played.map((s) => `${s.teamA}-${s.teamB}`).join(' ') : null;
}

function teamLabel(players: Array<{ user: BoardUser } | BoardUser>): string {
  return players.map((p) => agentUserDisplayName('user' in p ? p.user : p)).join(' & ');
}

function maxPerTeam(board: Board, playingCount: number): number {
  return maxPlayersPerTeamForGame({ playersPerMatch: board.playersPerMatch, sport: board.sport }, playingCount);
}

async function playingRoster(gameId: string): Promise<BoardUser[]> {
  const rows = await prisma.gameParticipant.findMany({
    where: { gameId, status: ParticipantStatus.PLAYING },
    select: { user: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { joinedAt: 'asc' },
  });
  return rows.map((row) => row.user);
}

// --- guards ---------------------------------------------------------------------------------

/**
 * Write guard: visibility first (hidden → 404, never 403), then the HTTP
 * `requireCanModifyResults` rule itself (`canModifyResults`).
 */
export async function assertAgentCanModifyResults(principal: AgentPrincipal, gameId: string): Promise<void> {
  await assertAgentCanViewGame(principal, gameId);
  await canModifyResults(gameId, principal.userId, principal.isAdmin);
}

function assertResultsEntitySupported(entityType: EntityType): void {
  if (RESULTS_FORBIDDEN_ENTITY_TYPES.includes(entityType)) {
    throw new ApiError(400, 'The assistant enters results for games, tournaments and league matches only; events, bar meetups, trainings and league seasons have no match scores here');
  }
}

async function refusal(
  ctx: AgentToolContext,
  gameId: string,
  key: AgentResultsI18nKey,
  error: string,
): Promise<AgentToolResult> {
  const handoff: AgentEntityRef = { type: 'handoff', url: gameHandoffUrl(gameId), label: agentResultsT(ctx.locale, 'handoff.openGame') };
  return {
    data: { error, message: agentResultsT(ctx.locale, key), handoffUrl: handoff.url },
    summary: agentResultsT(ctx.locale, 'summary.refused'),
    entities: [...(await gameEntityFor(gameId, ctx.principal.userId)), handoff],
  };
}

// --- lineup ---------------------------------------------------------------------------------

type Lineup = { teamA: string[]; teamB: string[] };

/**
 * A lineup for an empty match: every player is a PLAYING participant, nobody twice, each
 * side exactly `maxPerTeam` players; with fixed teams each side is one fixed team.
 */
async function validateLineup(board: Board, lineup: Lineup): Promise<{ lineup: Lineup; names: Record<string, BoardUser> }> {
  const roster = await playingRoster(board.id);
  const byId = new Map(roster.map((user) => [user.id, user]));
  const perTeam = maxPerTeam(board, roster.length);
  const all = [...lineup.teamA, ...lineup.teamB];
  if (new Set(all).size !== all.length) throw new ApiError(400, 'A player can only be on one side');
  if (lineup.teamA.length !== perTeam || lineup.teamB.length !== perTeam) {
    throw new ApiError(400, `Each side needs exactly ${perTeam} player(s)`);
  }
  for (const id of all) {
    if (!byId.has(id)) throw new ApiError(400, 'Every player must be a confirmed (PLAYING) player of this game; use the ids from get_game_results');
  }
  if (board.hasFixedTeams) {
    const teams = await prisma.gameTeam.findMany({ where: { gameId: board.id }, select: { players: { select: { userId: true } } } });
    const isFixedTeam = (side: string[]) =>
      teams.some((team) => team.players.length === side.length && team.players.every((p) => side.includes(p.userId)));
    if (!isFixedTeam(lineup.teamA) || !isFixedTeam(lineup.teamB)) {
      throw new ApiError(400, 'This game has fixed teams: each side must be one of its teams');
    }
  }
  return { lineup, names: Object.fromEntries(all.map((id) => [id, byId.get(id)!])) };
}

/** The HANDMADE generator fills a head-to-head fixed-teams match itself (`tryGenerateHeadToHeadFixedTeamsMatch`). */
async function fixedTeamsHeadToHead(board: Board): Promise<Lineup | null> {
  if (!board.hasFixedTeams) return null;
  const roster = await playingRoster(board.id);
  const perMatch = maxPerTeam(board, roster.length) * 2;
  if (roster.length !== perMatch) return null;
  const teams = await prisma.gameTeam.findMany({
    where: { gameId: board.id },
    orderBy: { teamNumber: 'asc' },
    select: { players: { select: { userId: true }, orderBy: { createdAt: 'asc' } } },
  });
  if (teams.length < 2) return null;
  return { teamA: teams[0].players.map((p) => p.userId), teamB: teams[1].players.map((p) => p.userId) };
}

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));

// --- get_game_results -----------------------------------------------------------------------

export const getGameResultsTool = defineTool({
  name: 'get_game_results',
  description:
    'Get the results of a game: status (NONE | IN_PROGRESS | FINAL), each match with its matchId, sides teamA / teamB (players, "you"), set scores and outcome, standings when final, and whether the user may enter scores. Use the matchId and side names from here for enter_match_score.',
  kind: 'read',
  scope: 'user',
  input: z.object({ gameId: ID }).strict(),
  label: (_args, locale) => agentResultsT(locale, 'label.getResults'),
  handler: async (ctx, args) => {
    const { principal } = ctx;
    await assertAgentCanViewGame(principal, args.gameId);
    // The HTTP read rule on top (private game → roster of it or of its parent).
    await assertCanReadGameResults(args.gameId, principal.userId);
    const board = await loadBoard(args.gameId);
    const me = principal.userId;
    const flat = flatMatches(board);
    const player = (p: { userId: string; user: BoardUser }) => ({
      playerId: p.userId,
      name: agentUserDisplayName(p.user),
      ...(p.userId === me ? { you: true } : {}),
    });
    let canEnterResults = false;
    if (!RESULTS_FORBIDDEN_ENTITY_TYPES.includes(board.entityType) && board.resultsStatus !== 'FINAL') {
      canEnterResults = await canModifyResults(board.id, me, principal.isAdmin).then(
        () => true,
        () => false,
      );
    }
    let finished = 0;
    const matches = flat.map(({ match, roundNumber, matchNumber }) => {
      const sets = boardSets(match);
      const outcome = matchOutcome(sets, board);
      if (outcome) finished += 1;
      return {
        matchId: match.id,
        round: roundNumber,
        match: matchNumber,
        teamA: sidePlayers(match, 1).map(player),
        teamB: sidePlayers(match, 2).map(player),
        sets: sets.filter((s) => s.role === 'OFFICIAL').map((s) => ({ teamA: s.teamA, teamB: s.teamB, ...(s.isTieBreak ? { tieBreak: true } : {}) })),
        outcome,
      };
    });
    // An empty lineup needs players from the roster (enter_match_score `lineup`).
    const needsRoster = canEnterResults && (flat.length === 0 || flat.some(({ match }) => match.teams.every((t) => t.players.length === 0)));
    const roster = needsRoster ? (await playingRoster(board.id)).map((u) => ({ playerId: u.id, name: agentUserDisplayName(u), ...(u.id === me ? { you: true } : {}) })) : undefined;
    const standings = board.resultsStatus === 'FINAL'
      ? board.outcomes.slice(0, MAX_STANDINGS_LISTED).map((o) => ({
          position: o.position,
          playerId: o.userId,
          name: agentUserDisplayName(o.user),
          ...(o.userId === me ? { you: true } : {}),
          isWinner: o.isWinner,
          wins: o.wins,
          ties: o.ties,
          losses: o.losses,
          points: o.pointsEarned,
          levelChange: Math.round(o.levelChange * 100) / 100,
        }))
      : undefined;
    return {
      data: {
        gameId: board.id,
        entityType: board.entityType,
        gameStatus: board.status,
        resultsStatus: board.resultsStatus,
        canEnterResults,
        ...(canEnterResults ? { playersPerSide: maxPerTeam(board, roster?.length ?? 0) } : {}),
        matchCount: flat.length,
        matches: matches.slice(0, MAX_MATCHES_LISTED),
        ...(matches.length > MAX_MATCHES_LISTED ? { truncated: true } : {}),
        ...(roster ? { roster } : {}),
        ...(standings ? { standings } : {}),
        handoffUrl: gameHandoffUrl(board.id),
      },
      summary: agentResultsT(ctx.locale, 'summary.results', { finished, total: flat.length }),
      entities: await gameEntityFor(board.id, me),
    };
  },
});

// --- enter_match_score ----------------------------------------------------------------------

const setInput = z
  .object({
    teamA: z.number().int().min(0).max(SCORE_MAX),
    teamB: z.number().int().min(0).max(SCORE_MAX),
    tieBreak: z.boolean().optional().describe('true for a (super) tie-break set, e.g. 10-8 as the decider'),
  })
  .strict();

const enterMatchScoreInput = z
  .object({
    gameId: ID,
    matchId: ID.optional().describe('matchId from get_game_results. Omit only when the game has one match, or no results yet'),
    sets: z.array(setInput).min(1).max(7).describe('Every set of the match in order, scores as teamA-teamB of get_game_results'),
    lineup: z
      .object({
        teamA: z.array(ID).min(1).max(2),
        teamB: z.array(ID).min(1).max(2),
      })
      .strict()
      .optional()
      .describe('Only when the match has no players yet: playerIds from get_game_results roster for each side. Never for a match that already has players'),
  })
  .strict();

const enterPlanSchema = z
  .object({
    gameId: z.string(),
    /** `start`: run the board's start step first (results NONE → IN_PROGRESS, one generated match). */
    mode: z.enum(['update', 'start']),
    matchId: z.string().nullable(),
    /** The match version the card was built from (the board's `baseVersion`); null for `start`. */
    baseVersion: z.string().nullable(),
    teamA: z.array(z.string()),
    teamB: z.array(z.string()),
    sets: z.array(z.object({ teamA: z.number(), teamB: z.number(), isTieBreak: z.boolean() }).strict()),
  })
  .strict();
type EnterPlan = z.infer<typeof enterPlanSchema>;

function normalizedSets(sets: EnterPlan['sets']): NormalizedMatchSetRow[] {
  return sets.map((s) => ({ teamA: s.teamA, teamB: s.teamB, isTieBreak: s.isTieBreak, role: MatchSetRole.OFFICIAL }));
}

function stale(ctx: AgentWriteContext, changed: boolean): AgentWriteOutcome {
  return {
    message: agentResultsT(ctx.locale, 'result.stale'),
    failed: { changed },
    modelData: { error: 'results_changed', hint: 'Call get_game_results again and prepare a new card if the user still wants it.' },
  };
}

const isVersionConflict = (error: unknown) => error instanceof ApiError && error.statusCode === 409;

type ResultsSocket = {
  emitGameUpdate: (gameId: string, userId: string) => Promise<void>;
  emitGameResultsUpdated: (gameId: string, userId: string) => Promise<void>;
};
/** The app-wide socket service the results controller emits through (set in `app.ts`). */
const resultsSocket = (): ResultsSocket | undefined => (globalThis as { socketService?: ResultsSocket }).socketService;

export const enterMatchScoreTool = defineTool({
  name: 'enter_match_score',
  description:
    'Prepare saving the score of one match of a game the user may score (owner/admin, or any player when the game allows it): e.g. "we won 6-4 6-3". Sides are teamA / teamB as in get_game_results. Creates a confirmation card; nothing is saved until the user confirms. Not for final results (resetting or editing final results happens in the app).',
  kind: 'write',
  riskTier: 'standard',
  scope: 'user',
  promptHint: 'enter the score of a match (sets per side, sides as in get_game_results); final results can only be reset or edited in the app (/games/<id>)',
  input: enterMatchScoreInput,
  label: (_args, locale) => agentResultsT(locale, 'label.enterScore'),
  handler: async (ctx, args) => {
    const { principal, locale } = ctx;
    await assertAgentCanModifyResults(principal, args.gameId);
    const [game, board] = await Promise.all([loadGameForWrite(args.gameId), loadBoard(args.gameId)]);
    assertResultsEntitySupported(board.entityType);
    if (board.resultsStatus === 'FINAL') return refusal(ctx, board.id, 'refuse.final', 'results_final');

    const warnings: string[] = [];
    const lines: AgentActionPreviewLine[] = [];
    let plan: EnterPlan;
    let names: Record<string, BoardUser> = {};
    const sets = args.sets.map((s) => ({ teamA: s.teamA, teamB: s.teamB, isTieBreak: Boolean(s.tieBreak) }));
    assertMatchNormalizedSetsValid(board as unknown as Parameters<typeof assertMatchNormalizedSetsValid>[0], normalizedSets(sets));

    const flat = flatMatches(board);
    if (board.rounds.length === 0) {
      if (board.matchGenerationType && board.matchGenerationType !== MatchGenerationType.HANDMADE) {
        return refusal(ctx, board.id, 'refuse.startInApp', 'start_results_in_app');
      }
      if (args.matchId) throw new ApiError(400, 'Results have not started: there is no match yet; omit matchId');
      const generated = await fixedTeamsHeadToHead(board);
      if (generated && args.lineup && !(sameIds(generated.teamA, args.lineup.teamA) && sameIds(generated.teamB, args.lineup.teamB))) {
        return refusal(ctx, board.id, 'refuse.lineupInApp', 'lineup_differs');
      }
      const lineup = generated ?? args.lineup;
      if (!lineup) throw new ApiError(400, 'The match has no players yet: pass lineup with playerIds from get_game_results roster');
      names = (await validateLineup(board, lineup)).names;
      plan = { gameId: board.id, mode: 'start', matchId: null, baseVersion: null, teamA: lineup.teamA, teamB: lineup.teamB, sets };
      lines.push(line(agentResultsT(locale, 'field.match'), null, agentResultsT(locale, 'value.match', { round: 1, match: 1 })));
      warnings.push(agentResultsT(locale, 'warn.startsResults'));
      if (board.status === 'ANNOUNCED') warnings.push(agentResultsT(locale, 'warn.notStartedYet'));
    } else {
      let target: FlatMatch | undefined;
      if (args.matchId) {
        target = flat.find((entry) => entry.match.id === args.matchId);
        if (!target) throw new ApiError(404, 'Match not found');
      } else if (flat.length === 1) {
        target = flat[0];
      } else {
        throw new ApiError(400, 'This game has several matches: pass the matchId from get_game_results');
      }
      const { match } = target;
      const existingA = sidePlayers(match, 1);
      const existingB = sidePlayers(match, 2);
      let lineup: Lineup;
      if (existingA.length === 0 && existingB.length === 0) {
        if (!args.lineup) throw new ApiError(400, 'The match has no players yet: pass lineup with playerIds from get_game_results roster');
        lineup = args.lineup;
        names = (await validateLineup(board, lineup)).names;
      } else {
        const roster = await playingRoster(board.id);
        const perTeam = maxPerTeam(board, roster.length);
        if (existingA.length !== perTeam || existingB.length !== perTeam) {
          return refusal(ctx, board.id, 'refuse.lineupInApp', 'lineup_incomplete');
        }
        lineup = { teamA: existingA.map((p) => p.userId), teamB: existingB.map((p) => p.userId) };
        if (args.lineup && !(sameIds(lineup.teamA, args.lineup.teamA) && sameIds(lineup.teamB, args.lineup.teamB))) {
          return refusal(ctx, board.id, 'refuse.lineupInApp', 'lineup_differs');
        }
        names = Object.fromEntries([...existingA, ...existingB].map((p) => [p.userId, p.user]));
      }
      const before = boardSets(match);
      if (before.some((s) => s.role !== 'OFFICIAL')) return refusal(ctx, board.id, 'refuse.extraSets', 'extra_sets');
      const beforeScore = formatScore(before);
      plan = { gameId: board.id, mode: 'update', matchId: match.id, baseVersion: match.resultsVersion, teamA: lineup.teamA, teamB: lineup.teamB, sets };
      lines.push(line(agentResultsT(locale, 'field.match'), null, agentResultsT(locale, 'value.match', { round: target.roundNumber, match: target.matchNumber })));
      if (beforeScore) warnings.push(agentResultsT(locale, 'warn.replacesScore', { score: beforeScore }));
      const live = (match.metadata as { liveScoring?: { state?: unknown } } | null)?.liveScoring;
      if (live?.state != null) warnings.push(agentResultsT(locale, 'warn.liveScoring'));
      lines.push(line(agentResultsT(locale, 'field.score'), beforeScore ?? agentResultsT(locale, 'value.noScore'), formatScore(sets) ?? agentResultsT(locale, 'value.noScore')));
    }

    const sideA = teamLabel(plan.teamA.map((id) => names[id]));
    const sideB = teamLabel(plan.teamB.map((id) => names[id]));
    lines.push(line(agentResultsT(locale, 'field.teamA'), null, sideA));
    lines.push(line(agentResultsT(locale, 'field.teamB'), null, sideB));
    if (plan.mode === 'start') {
      lines.push(line(agentResultsT(locale, 'field.score'), null, formatScore(sets) ?? agentResultsT(locale, 'value.noScore')));
    }
    const outcome = matchOutcome(sets.map((s) => ({ ...s, role: 'OFFICIAL' })), board);
    lines.push(
      line(
        agentResultsT(locale, 'field.outcome'),
        null,
        outcome === 'teamA'
          ? agentResultsT(locale, 'value.winner', { team: sideA })
          : outcome === 'teamB'
            ? agentResultsT(locale, 'value.winner', { team: sideB })
            : outcome === 'tie'
              ? agentResultsT(locale, 'value.draw')
              : agentResultsT(locale, 'value.undecided'),
      ),
    );
    const title = agentGameTitle(game);
    const preview: AgentActionPreview = {
      title: agentResultsT(locale, 'preview.score.title', { game: clip(title, 60) ?? title }),
      lines,
      warnings,
    };
    return proposeAgentAction(ctx, { toolName: 'enter_match_score', input: args, plan, preview });
  },
  confirm: {
    authorize: async (principal, rawPlan) => {
      const plan = parsePlan(enterPlanSchema, rawPlan);
      await assertAgentCanModifyResults(principal, plan.gameId);
    },
    execute: async (ctx, rawPlan) => {
      const plan = parsePlan(enterPlanSchema, rawPlan);
      const userId = ctx.principal.userId;
      let board = await loadBoard(plan.gameId);
      assertResultsEntitySupported(board.entityType);
      if (board.resultsStatus === 'FINAL') throw new ApiError(409, 'Results are final; reset or edit them in the app');
      // The players must still be confirmed players (and fixed teams) at confirm time.
      await validateLineup(board, { teamA: plan.teamA, teamB: plan.teamB });

      let matchId = plan.matchId;
      let baseVersion = plan.baseVersion;
      let started = false;
      if (plan.mode === 'start') {
        if (board.rounds.length > 0) return stale(ctx, false);
        const { alreadyHadRounds } = await startResultsEntryWithGeneratedRound(plan.gameId);
        if (alreadyHadRounds) return stale(ctx, false);
        started = true;
        const socket = resultsSocket();
        if (socket) {
          await socket.emitGameResultsUpdated(plan.gameId, userId);
          await socket.emitGameUpdate(plan.gameId, userId);
        }
        board = await loadBoard(plan.gameId);
        const flat = flatMatches(board);
        const only = flat.length === 1 ? flat[0].match : null;
        const hasPlayers = only ? only.teams.some((t) => t.players.length > 0) : false;
        const matchesPlan =
          only != null &&
          (!hasPlayers ||
            (sameIds(sidePlayers(only, 1).map((p) => p.userId), plan.teamA) && sameIds(sidePlayers(only, 2).map((p) => p.userId), plan.teamB)));
        if (!only || !matchesPlan) return stale(ctx, true);
        matchId = only.id;
        baseVersion = only.resultsVersion;
      }

      let liveScoringCleared = false;
      try {
        // The board's manual PUT: whole lineup + all sets, checked against the card's version.
        ({ liveScoringCleared } = await resultsService.updateMatch(
          plan.gameId,
          matchId!,
          { teamA: plan.teamA, teamB: plan.teamB, sets: plan.sets.map((s) => ({ ...s, role: MatchSetRole.OFFICIAL })), baseVersion: baseVersion ?? undefined },
          { userId },
        ));
      } catch (error) {
        if (isVersionConflict(error)) return stale(ctx, started);
        throw error;
      }
      if (liveScoringCleared) notifyMatchLiveScoringCleared(plan.gameId, matchId!);
      await resultsSocket()?.emitGameResultsUpdated(plan.gameId, userId);

      const score = formatScore(plan.sets) ?? '0-0';
      const outcome = matchOutcome(plan.sets.map((s) => ({ ...s, role: 'OFFICIAL' })), board);
      return {
        message: agentResultsT(ctx.locale, 'result.scoreSaved', { score }),
        entities: await gameEntityFor(plan.gameId, userId),
        modelData: { gameId: plan.gameId, matchId, sets: plan.sets, outcome, resultsStatus: 'IN_PROGRESS', resultsStarted: started },
      };
    },
  },
});

// --- finish_results -------------------------------------------------------------------------

const finishPlanSchema = z.object({ gameId: z.string(), boardVersion: z.string() }).strict();

type FinishSummary = { total: number; finished: number; ties: number; unscored: FlatMatch[]; incompleteLineups: FlatMatch[] };

/** The board's finish summary (`summarizeResultsProgress` in the app). */
async function summarizeBoard(board: Board): Promise<FinishSummary> {
  const roster = await playingRoster(board.id);
  const perTeam = maxPerTeam(board, roster.length);
  const summary: FinishSummary = { total: 0, finished: 0, ties: 0, unscored: [], incompleteLineups: [] };
  for (const entry of flatMatches(board)) {
    summary.total += 1;
    const outcome = matchOutcome(boardSets(entry.match), board);
    if (outcome) {
      summary.finished += 1;
      if (outcome === 'tie') summary.ties += 1;
    } else if (sidePlayers(entry.match, 1).length >= perTeam && sidePlayers(entry.match, 2).length >= perTeam) {
      summary.unscored.push(entry);
    } else {
      summary.incompleteLineups.push(entry);
    }
  }
  return summary;
}

function refList(locale: string, refs: FlatMatch[]): string {
  const shown = refs
    .slice(0, MAX_REFS_SHOWN)
    .map((ref) => agentResultsT(locale, 'value.match', { round: ref.roundNumber, match: ref.matchNumber }))
    .join(', ');
  return refs.length > MAX_REFS_SHOWN
    ? agentResultsT(locale, 'value.andMore', { list: shown, count: refs.length - MAX_REFS_SHOWN })
    : shown;
}

export const finishResultsTool = defineTool({
  name: 'finish_results',
  description:
    'Prepare finishing the results of a game the user may score (IN_PROGRESS → FINAL): outcomes, player ratings, standings and bets are settled from the saved scores. Creates a confirmation card listing unscored or incomplete matches and draws; nothing changes until the user confirms. Final results can only be reset or edited in the app.',
  kind: 'write',
  riskTier: 'critical',
  scope: 'user',
  promptHint: 'finish the results of a game (makes them final: ratings, standings, bets); resetting or editing final results happens in the app (/games/<id>)',
  input: z.object({ gameId: ID }).strict(),
  label: (_args, locale) => agentResultsT(locale, 'label.finish'),
  handler: async (ctx, args) => {
    const { principal, locale } = ctx;
    await assertAgentCanModifyResults(principal, args.gameId);
    const [game, board] = await Promise.all([loadGameForWrite(args.gameId), loadBoard(args.gameId)]);
    assertResultsEntitySupported(board.entityType);
    if (board.resultsStatus === 'FINAL') return refusal(ctx, board.id, 'refuse.final', 'results_final');
    if (board.resultsStatus !== 'IN_PROGRESS') return refusal(ctx, board.id, 'refuse.notStarted', 'results_not_started');
    const summary = await summarizeBoard(board);
    if (summary.finished === 0) return refusal(ctx, board.id, 'refuse.nothingScored', 'nothing_scored');

    const lines: AgentActionPreviewLine[] = [
      line(agentResultsT(locale, 'field.scored'), null, agentResultsT(locale, 'value.scoredOf', { finished: summary.finished, total: summary.total })),
    ];
    if (summary.unscored.length) lines.push(line(agentResultsT(locale, 'field.unscored'), null, refList(locale, summary.unscored)));
    if (summary.incompleteLineups.length) {
      lines.push(line(agentResultsT(locale, 'field.incompleteLineup'), null, refList(locale, summary.incompleteLineups)));
    }
    if (summary.ties) lines.push(line(agentResultsT(locale, 'field.ties'), null, String(summary.ties)));
    const warnings: string[] = [];
    if (summary.unscored.length || summary.incompleteLineups.length) warnings.push(agentResultsT(locale, 'warn.unscoredIgnored'));
    if (board.affectsRating) warnings.push(agentResultsT(locale, 'warn.ratings'));
    warnings.push(agentResultsT(locale, 'warn.bets'));

    const title = agentGameTitle(game);
    const preview: AgentActionPreview = {
      title: agentResultsT(locale, 'preview.finish.title', { game: clip(title, 60) ?? title }),
      lines,
      warnings,
    };
    const plan: z.infer<typeof finishPlanSchema> = { gameId: board.id, boardVersion: board.resultsVersion };
    return proposeAgentAction(ctx, { toolName: 'finish_results', input: args, plan, preview });
  },
  confirm: {
    authorize: async (principal, rawPlan) => {
      const plan = parsePlan(finishPlanSchema, rawPlan);
      await assertAgentCanModifyResults(principal, plan.gameId);
    },
    execute: async (ctx, rawPlan) => {
      const plan = parsePlan(finishPlanSchema, rawPlan);
      const board = await loadBoard(plan.gameId);
      assertResultsEntitySupported(board.entityType);
      // The card summarized this board; a changed board (scores, status) needs a new card.
      if (board.resultsStatus !== 'IN_PROGRESS' || board.resultsVersion !== plan.boardVersion) return stale(ctx, false);
      await recalculateGameOutcomes(plan.gameId);
      const socket = resultsSocket();
      if (socket) {
        await socket.emitGameUpdate(plan.gameId, ctx.principal.userId);
        await socket.emitGameResultsUpdated(plan.gameId, ctx.principal.userId);
      }
      const after = await prisma.game.findUniqueOrThrow({ where: { id: plan.gameId }, select: { resultsStatus: true, status: true } });
      return {
        message: agentResultsT(ctx.locale, 'result.finished'),
        entities: await gameEntityFor(plan.gameId, ctx.principal.userId),
        modelData: { gameId: plan.gameId, resultsStatus: after.resultsStatus, gameStatus: after.status },
      };
    },
  },
});

export const RESULTS_TOOLS = [getGameResultsTool, enterMatchScoreTool, finishResultsTool];
