/**
 * Permission-matrix harness for AI agent tools.
 *
 * Every agent tool gets a matrix: fixed actors × fixed games → expected outcome.
 * Later phases reuse this file:
 *
 *   const fixture = await createAgentPermissionFixture();
 *   try {
 *     const report = await runAgentPermissionMatrix({
 *       label: 'get_game',
 *       fixture,
 *       expectations: { public: matrixRow('A A A A A A A A'), ... },
 *       run: (principal, gameId) => getGameTool.handler({ principal }, { gameId }),
 *     });
 *     assertMatrixReport(report);
 *   } finally {
 *     await fixture.cleanup();
 *   }
 *
 * Runs against the real dev database (like the other `*.integration.test.ts`); every
 * row it creates carries a unique suffix and is deleted in `cleanup()`.
 *
 * System games (`cityId === null`) are not in the DB fixture: `Game.cityId` is
 * non-null in the schema, so such a row cannot be created. The pure decision
 * (`canAgentViewGameRow`) covers that case in `agentGameVisibility.test.ts`.
 */
import {
  EntityType,
  EventApprovalStatus,
  GameStatus,
  GameType,
  ParticipantRole,
  ParticipantStatus,
  ResultsStatus,
  Sport,
  type Prisma,
} from '@prisma/client';
import prisma from '../../../../config/database';
import { ApiError } from '../../../../utils/ApiError';
import { loadAgentPrincipal, type AgentPrincipal } from '../agentPrincipal';

export const AGENT_MATRIX_ACTORS = [
  'stranger',
  'invited',
  'queued',
  'player',
  'gameAdmin',
  'owner',
  'leagueOwner',
  'globalAdmin',
] as const;
export type AgentMatrixActor = (typeof AGENT_MATRIX_ACTORS)[number];

export const AGENT_MATRIX_GAMES = [
  /** GAME, public, standard roster. */
  'public',
  /** GAME, private, standard roster. */
  'private',
  /** GAME, public, `status = ARCHIVED`, standard roster. */
  'archived',
  /** GAME, public, `resultsStatus = IN_PROGRESS`, standard roster. */
  'resultsLocked',
  /** EVENT, public, `eventApprovalStatus = ON_APPROVE`, standard roster. */
  'pendingEvent',
  /** LEAGUE_SEASON shell, private; only `leagueOwner` (OWNER, NON_PLAYING) on it. */
  'privateSeason',
  /** GAME under `privateSeason`, itself `isPublic = true`, standard roster. */
  'leagueFixture',
] as const;
export type AgentMatrixGame = (typeof AGENT_MATRIX_GAMES)[number];

export type AgentMatrixOutcome = 'allow' | 'not_found' | 'forbidden' | 'bad_request';
export type AgentMatrixRow = Record<AgentMatrixActor, AgentMatrixOutcome>;
export type AgentMatrixExpectations = Record<AgentMatrixGame, AgentMatrixRow>;

const OUTCOME_LETTER: Record<string, AgentMatrixOutcome> = {
  A: 'allow',
  N: 'not_found',
  F: 'forbidden',
  B: 'bad_request',
};

/**
 * One expectation row in actor order
 * `stranger invited queued player gameAdmin owner leagueOwner globalAdmin`,
 * letters A = allow, N = not found (404), F = forbidden (403), B = bad request (400).
 */
export function matrixRow(letters: string): AgentMatrixRow {
  const parts = letters.trim().split(/\s+/);
  if (parts.length !== AGENT_MATRIX_ACTORS.length) {
    throw new Error(`matrixRow expects ${AGENT_MATRIX_ACTORS.length} letters, got "${letters}"`);
  }
  const row = {} as AgentMatrixRow;
  AGENT_MATRIX_ACTORS.forEach((actor, index) => {
    const outcome = OUTCOME_LETTER[parts[index]];
    if (!outcome) throw new Error(`matrixRow: unknown letter "${parts[index]}" in "${letters}"`);
    row[actor] = outcome;
  });
  return row;
}

export type AgentPermissionFixture = {
  suffix: string;
  cityId: string;
  principals: Record<AgentMatrixActor, AgentPrincipal>;
  games: Record<AgentMatrixGame, string>;
  cleanup: () => Promise<void>;
};

type RosterEntry = { actor: AgentMatrixActor; role: ParticipantRole; status: ParticipantStatus };

/** Roster on every game except `privateSeason`. `leagueOwner` / `globalAdmin` / `stranger` are absent. */
const STANDARD_ROSTER: RosterEntry[] = [
  { actor: 'owner', role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING },
  { actor: 'gameAdmin', role: ParticipantRole.ADMIN, status: ParticipantStatus.PLAYING },
  { actor: 'player', role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.PLAYING },
  { actor: 'queued', role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.IN_QUEUE },
  { actor: 'invited', role: ParticipantRole.PARTICIPANT, status: ParticipantStatus.INVITED },
];

const SEASON_ROSTER: RosterEntry[] = [
  { actor: 'leagueOwner', role: ParticipantRole.OWNER, status: ParticipantStatus.NON_PLAYING },
];

export async function createAgentPermissionFixture(): Promise<AgentPermissionFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const city = await prisma.city.create({
    data: { name: `Agent permission matrix ${suffix}`, country: 'Test', timezone: 'UTC' },
  });
  const userIds = {} as Record<AgentMatrixActor, string>;
  const gameIds = {} as Record<AgentMatrixGame, string>;
  const createdGameIds: string[] = [];

  const cleanup = async () => {
    // Children before parents (fixture → season).
    for (const id of [...createdGameIds].reverse()) {
      await prisma.game.deleteMany({ where: { id } });
    }
    await prisma.user.deleteMany({ where: { id: { in: Object.values(userIds) } } });
    await prisma.city.deleteMany({ where: { id: city.id } });
  };

  try {
    for (const actor of AGENT_MATRIX_ACTORS) {
      const user = await prisma.user.create({
        data: {
          phone: `qa-agent-matrix-${actor}-${suffix}`,
          firstName: actor,
          currentCityId: city.id,
          isAdmin: actor === 'globalAdmin',
        },
      });
      userIds[actor] = user.id;
    }

    const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + 90 * 60 * 1000);

    const createGame = async (
      key: AgentMatrixGame,
      data: Partial<Prisma.GameUncheckedCreateInput>,
      roster: RosterEntry[],
    ) => {
      const game = await prisma.game.create({
        data: {
          entityType: EntityType.GAME,
          sport: Sport.PADEL,
          gameType: GameType.CLASSIC,
          cityId: city.id,
          startTime,
          endTime,
          timeIsSet: true,
          isPublic: true,
          ...data,
          participants: {
            create: roster.map((entry) => ({
              userId: userIds[entry.actor],
              role: entry.role,
              status: entry.status,
              ...(entry.status === ParticipantStatus.INVITED
                ? { invitedByUserId: userIds.owner }
                : {}),
            })),
          },
        },
        select: { id: true },
      });
      gameIds[key] = game.id;
      createdGameIds.push(game.id);
    };

    await createGame('public', {}, STANDARD_ROSTER);
    await createGame('private', { isPublic: false }, STANDARD_ROSTER);
    await createGame('archived', { status: GameStatus.ARCHIVED }, STANDARD_ROSTER);
    await createGame('resultsLocked', { resultsStatus: ResultsStatus.IN_PROGRESS }, STANDARD_ROSTER);
    await createGame(
      'pendingEvent',
      { entityType: EntityType.EVENT, eventApprovalStatus: EventApprovalStatus.ON_APPROVE },
      STANDARD_ROSTER,
    );
    await createGame(
      'privateSeason',
      { entityType: EntityType.LEAGUE_SEASON, isPublic: false },
      SEASON_ROSTER,
    );
    await createGame(
      'leagueFixture',
      { parentId: gameIds.privateSeason, isPublic: true },
      STANDARD_ROSTER,
    );

    const principals = {} as Record<AgentMatrixActor, AgentPrincipal>;
    for (const actor of AGENT_MATRIX_ACTORS) {
      principals[actor] = await loadAgentPrincipal(userIds[actor]);
    }

    return { suffix, cityId: city.id, principals, games: gameIds, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

/** Maps a guard's result to a matrix outcome. Unexpected errors are rethrown. */
export async function classifyAgentOutcome(run: () => Promise<unknown>): Promise<AgentMatrixOutcome> {
  try {
    await run();
    return 'allow';
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.statusCode === 404) return 'not_found';
      if (error.statusCode === 403) return 'forbidden';
      if (error.statusCode === 400) return 'bad_request';
    }
    throw error;
  }
}

export type AgentMatrixReport = {
  label: string;
  total: number;
  passed: number;
  failures: string[];
};

/**
 * Runs `run(principal, gameId)` for every actor × game and compares with
 * `expectations`. Never stops at the first mismatch, so one run shows the whole diff.
 */
export async function runAgentPermissionMatrix(params: {
  label: string;
  fixture: AgentPermissionFixture;
  expectations: AgentMatrixExpectations;
  run: (principal: AgentPrincipal, gameId: string) => Promise<unknown>;
}): Promise<AgentMatrixReport> {
  const { label, fixture, expectations, run } = params;
  const failures: string[] = [];
  let total = 0;
  for (const game of AGENT_MATRIX_GAMES) {
    for (const actor of AGENT_MATRIX_ACTORS) {
      total += 1;
      const expected = expectations[game][actor];
      let actual: string;
      try {
        actual = await classifyAgentOutcome(() => run(fixture.principals[actor], fixture.games[game]));
      } catch (error) {
        actual = `error(${error instanceof Error ? error.message : String(error)})`;
      }
      if (actual !== expected) {
        failures.push(`${label}: ${actor} × ${game} expected ${expected}, got ${actual}`);
      }
    }
  }
  return { label, total, passed: total - failures.length, failures };
}

export function assertMatrixReport(report: AgentMatrixReport): void {
  console.log(`${report.label}: ${report.passed}/${report.total} cells ok`);
  if (report.failures.length > 0) {
    throw new Error(`${report.label} matrix mismatches:\n  ${report.failures.join('\n  ')}`);
  }
}
