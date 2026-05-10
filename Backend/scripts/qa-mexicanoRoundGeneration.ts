/**
 * QA: Mexicano (matchGenerationType ESCALERA / generateEscaleraRound). Run:
 *   DB_URL=... npx ts-node scripts/qa-mexicanoRoundGeneration.ts
 */
import { randomUUID } from 'crypto';
import type { GenGame, GenMatch, GenRound } from '../src/services/results/generation/types';
import { generateEscaleraRound } from '../src/services/results/generation/escalera';
import {
  getEligibleParticipants,
  getNumMatches,
  getFilteredFixedTeams,
  rosterMultisetKey,
} from '../src/services/results/generation/matchUtils';

function ensureDbUrl() {
  let url = process.env.DB_URL;
  if (!url) {
    throw new Error('Set DB_URL (e.g. postgresql://user:pass@host:5432/db?schema=padelpulse)');
  }
  if (!/[?&]schema=/.test(url)) {
    url += (url.includes('?') ? '&' : '?') + 'schema=padelpulse';
    process.env.DB_URL = url;
  }
}

type Gender = 'MALE' | 'FEMALE';

function mkUser(id: string, gender: Gender, level = 4) {
  return { id, level, gender, firstName: 'Q', lastName: 'A' };
}

function mkParticipant(userId: string, gender: Gender, level = 4) {
  const u = mkUser(userId, gender, level);
  return { userId, status: 'PLAYING', user: u };
}

const initialSets = [{ teamA: 0, teamB: 0, isTieBreak: false as const }];

function courtIds(n: number): { courtId: string; order: number }[] {
  return Array.from({ length: n }, (_, i) => ({ courtId: `qa-mex-court-${i}-${randomUUID().slice(0, 8)}`, order: i }));
}

function assertMixTeam(team: string[], genderByUser: Map<string, Gender>) {
  if (team.length !== 2) throw new Error(`MIX: team size ${team.length}`);
  const g0 = genderByUser.get(team[0]!);
  const g1 = genderByUser.get(team[1]!);
  if (g0 === g1) throw new Error('MIX: team must be one MALE one FEMALE');
}

function validateMatch(
  game: GenGame,
  m: GenMatch,
  genderByUser: Map<string, Gender>,
  fixedRosterKeys: Set<string>,
) {
  if (m.teamA.length !== 2 || m.teamB.length !== 2) {
    throw new Error(`expected 2v2, got ${m.teamA.length} vs ${m.teamB.length}`);
  }
  const all = [...m.teamA, ...m.teamB];
  if (new Set(all).size !== 4) throw new Error('duplicate player in match');
  const cross = new Set<string>();
  for (const a of m.teamA) {
    for (const b of m.teamB) {
      cross.add(a < b ? `${a}:${b}` : `${b}:${a}`);
    }
  }
  if (cross.size !== 4) throw new Error('expected 4 cross edges');

  const g = game.genderTeams;
  if (g === 'MIX_PAIRS') {
    assertMixTeam(m.teamA, genderByUser);
    assertMixTeam(m.teamB, genderByUser);
  } else if (g === 'MEN') {
    for (const id of all) {
      if (genderByUser.get(id) !== 'MALE') throw new Error('MEN: non-male in match');
    }
  } else if (g === 'WOMEN') {
    for (const id of all) {
      if (genderByUser.get(id) !== 'FEMALE') throw new Error('WOMEN: non-female in match');
    }
  }

  if (game.hasFixedTeams && game.fixedTeams?.length) {
    const ka = rosterMultisetKey(m.teamA);
    const kb = rosterMultisetKey(m.teamB);
    if (!fixedRosterKeys.has(ka) || !fixedRosterKeys.has(kb)) {
      throw new Error('fixed: roster not in game fixed teams');
    }
    if (m.fixedTeamIdA && m.fixedTeamIdB) {
      const byId = new Map(game.fixedTeams.map((t) => [t.id, t] as const));
      const fa = byId.get(m.fixedTeamIdA);
      const fb = byId.get(m.fixedTeamIdB);
      if (!fa || !fb) throw new Error('fixedTeamId not found');
      if (rosterMultisetKey(fa.players.map((p) => p.userId)) !== ka) throw new Error('fixedTeamIdA roster mismatch');
      if (rosterMultisetKey(fb.players.map((p) => p.userId)) !== kb) throw new Error('fixedTeamIdB roster mismatch');
    }
  }
}

function fixedTeamsHavePlayerOverlap(game: GenGame): boolean {
  if (!game.fixedTeams?.length) return false;
  const perUser = new Map<string, number>();
  for (const t of game.fixedTeams) {
    for (const p of t.players) {
      perUser.set(p.userId, (perUser.get(p.userId) ?? 0) + 1);
    }
  }
  return [...perUser.values()].some((c) => c > 1);
}

function validateRound(
  label: string,
  game: GenGame,
  prior: GenRound[],
  matches: GenMatch[],
  roundIdx: number,
  genderByUser: Map<string, Gender>,
) {
  const elig = getEligibleParticipants(game);
  const expected = getNumMatches(game, elig);
  if (expected === 0) throw new Error(`${label} r${roundIdx}: getNumMatches=0`);
  if (matches.length !== expected) {
    throw new Error(`${label} r${roundIdx}: expected ${expected} matches, got ${matches.length}`);
  }

  const filtered = getFilteredFixedTeams(game);
  const fixedRosterKeys = new Set(filtered.map((t) => rosterMultisetKey(t)));

  const allowDupAcrossMatches = game.hasFixedTeams && fixedTeamsHavePlayerOverlap(game);
  const seen = new Set<string>();
  for (const m of matches) {
    validateMatch(game, m, genderByUser, fixedRosterKeys);
    if (!allowDupAcrossMatches) {
      for (const id of [...m.teamA, ...m.teamB]) {
        if (seen.has(id)) throw new Error(`${label} r${roundIdx}: player in multiple matches same round`);
        seen.add(id);
      }
    }
  }
}

function isRoundComplete(round: GenRound): boolean {
  const withPlayers = round.matches.filter((m) => m.teamA.length > 0 && m.teamB.length > 0);
  if (withPlayers.length === 0) return false;
  return withPlayers.every((m) => m.sets.some((s) => s.teamA > 0 || s.teamB > 0));
}

function applyDeterministicScores(matches: GenMatch[], roundIdx: number) {
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const teamAWins = (roundIdx + i) % 2 === 0;
    m.sets = [{ teamA: teamAWins ? 6 : 2, teamB: teamAWins ? 3 : 6, isTieBreak: false as const }];
  }
}

function runSequentialMexicanoRounds(
  label: string,
  game: GenGame,
  genderByUser: Map<string, Gender>,
  minSuccessfulRounds: number,
  maxAttempts: number,
) {
  const rounds: GenRound[] = [];
  let r = 0;
  for (; r < maxAttempts; r++) {
    const matches = generateEscaleraRound(game, rounds, initialSets);
    if (matches.length === 0) {
      if (rounds.length === 0) throw new Error(`${label}: first round empty`);
      const prev = rounds[rounds.length - 1]!;
      if (!isRoundComplete(prev)) {
        throw new Error(`${label}: dry round but previous not score-complete`);
      }
      break;
    }
    validateRound(label, game, rounds, matches, r, genderByUser);
    applyDeterministicScores(matches, r);
    const probe: GenRound = { id: 'probe', matches };
    if (!isRoundComplete(probe)) throw new Error(`${label}: internal scoring did not complete round`);
    rounds.push({ id: `qa-mex-r${r}`, matches });
  }
  if (rounds.length < minSuccessfulRounds) {
    throw new Error(
      `${label}: need >= ${minSuccessfulRounds} rounds (2× players/teams), got ${rounds.length} (attempts ${r})`,
    );
  }
  console.log(`ok: ${label} (${rounds.length} rounds)`);
}

function assignGendersForMode(
  userIds: string[],
  mode: string,
): { parts: ReturnType<typeof mkParticipant>[]; genderByUser: Map<string, Gender> } {
  const genderByUser = new Map<string, Gender>();
  const parts: ReturnType<typeof mkParticipant>[] = [];

  if (mode === 'MIX_PAIRS') {
    if (userIds.length % 2 !== 0) throw new Error('MIX needs even player count');
    const half = userIds.length / 2;
    for (let i = 0; i < userIds.length; i++) {
      const g: Gender = i < half ? 'MALE' : 'FEMALE';
      const id = userIds[i]!;
      genderByUser.set(id, g);
      parts.push(mkParticipant(id, g, 3 + (i % 5)));
    }
  } else if (mode === 'MEN') {
    for (let i = 0; i < userIds.length; i++) {
      const id = userIds[i]!;
      genderByUser.set(id, 'MALE');
      parts.push(mkParticipant(id, 'MALE', 3 + (i % 5)));
    }
  } else if (mode === 'WOMEN') {
    for (let i = 0; i < userIds.length; i++) {
      const id = userIds[i]!;
      genderByUser.set(id, 'FEMALE');
      parts.push(mkParticipant(id, 'FEMALE', 3 + (i % 5)));
    }
  } else {
    for (let i = 0; i < userIds.length; i++) {
      const id = userIds[i]!;
      genderByUser.set(id, 'MALE');
      parts.push(mkParticipant(id, 'MALE', 3 + (i % 5)));
    }
  }

  return { parts, genderByUser };
}

function baseGameFields(
  participants: ReturnType<typeof mkParticipant>[],
  courts: { courtId: string; order: number }[],
  genderTeams: string,
  fixed?: { hasFixedTeams: boolean; allowUserInMultipleTeams: boolean; fixedTeams: GenGame['fixedTeams'] },
): GenGame {
  return {
    id: randomUUID(),
    entityType: 'GAME',
    matchGenerationType: 'ESCALERA',
    participants,
    gameCourts: courts,
    genderTeams,
    hasFixedTeams: fixed?.hasFixedTeams ?? false,
    allowUserInMultipleTeams: fixed?.allowUserInMultipleTeams,
    fixedTeams: fixed?.fixedTeams,
    fixedNumberOfSets: 1,
    ballsInGames: false,
    winnerOfGame: 'BY_SCORES_DELTA',
    winnerOfMatch: 'BY_SCORES',
  };
}

function maxAttemptsFor(minRounds: number) {
  return Math.max(200, minRounds * 3 + 40);
}

async function main() {
  ensureDbUrl();
  const { default: prisma } = await import('../src/config/database');

  const users = await prisma.user.findMany({
    take: 64,
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  if (users.length < 52) {
    throw new Error('need at least 52 User rows');
  }
  const ids = users.map((u) => u.id);

  const genderModes = ['ANY', 'MEN', 'WOMEN', 'MIX_PAIRS'] as const;

  for (const mode of genderModes) {
    for (let n = 4; n <= 32; n++) {
      if (mode === 'MIX_PAIRS' && n % 2 !== 0) continue;
      const uidList = ids.slice(0, n);
      const { parts, genderByUser } = assignGendersForMode(uidList, mode);
      for (const numCourts of new Set([1, Math.min(4, Math.max(1, Math.floor(n / 4)))])) {
        const label = `mexicano dynamic ${mode} n=${n} courts=${numCourts}`;
        const game = baseGameFields(parts, courtIds(numCourts), mode === 'ANY' ? 'ANY' : mode);
        const minOk = 2 * n;
        runSequentialMexicanoRounds(label, game, genderByUser, minOk, maxAttemptsFor(minOk));
      }
    }
  }

  for (const mode of genderModes) {
    for (let teamCount = 4; teamCount <= 24; teamCount++) {
      const need = teamCount * 2;
      const pool = ids.slice(0, need);
      const teams: string[][] = [];
      for (let t = 0; t < teamCount; t++) {
        teams.push([pool[t * 2]!, pool[t * 2 + 1]!]);
      }

      const { parts, genderByUser } = assignGendersForMode(pool, mode);
      for (let ti = 0; ti < teams.length; ti++) {
        const [a, b] = teams[ti]!;
        if (mode === 'MIX_PAIRS') {
          genderByUser.set(a, 'MALE');
          genderByUser.set(b, 'FEMALE');
          parts[ti * 2] = mkParticipant(a, 'MALE', 3 + (ti % 5));
          parts[ti * 2 + 1] = mkParticipant(b, 'FEMALE', 3 + (ti % 5));
        }
      }

      const fixedTeams: NonNullable<GenGame['fixedTeams']> = teams.map((pair, idx) => ({
        id: `qa-mex-ft-${teamCount}-${idx}-${randomUUID().slice(0, 6)}`,
        teamNumber: idx + 1,
        players: pair.map((userId) => ({
          userId,
          user: mkUser(userId, genderByUser.get(userId)!, 3 + (idx % 5)),
        })),
      }));

      for (const allowMulti of [false, true] as const) {
        const numCourts = new Set([1, Math.min(4, Math.max(1, Math.floor((teamCount * 2) / 4)))]);
        for (const nc of numCourts) {
          const label = `mexicano fixed ${mode} teams=${teamCount} allowMulti=${allowMulti} courts=${nc}`;
          const game = baseGameFields(parts, courtIds(nc), mode === 'ANY' ? 'ANY' : mode, {
            hasFixedTeams: true,
            allowUserInMultipleTeams: allowMulti,
            fixedTeams,
          });
          const minOk = 2 * teamCount;
          runSequentialMexicanoRounds(label, game, genderByUser, minOk, maxAttemptsFor(minOk));
        }
      }
    }
  }

  const dynamicCourtMismatches: { n: number; courts: number }[] = [
    { n: 8, courts: 5 },
    { n: 16, courts: 3 },
    { n: 7, courts: 5 },
    { n: 5, courts: 4 },
    { n: 6, courts: 3 },
    { n: 9, courts: 8 },
    { n: 10, courts: 7 },
    { n: 11, courts: 6 },
    { n: 13, courts: 2 },
    { n: 14, courts: 5 },
    { n: 15, courts: 4 },
    { n: 17, courts: 8 },
    { n: 18, courts: 3 },
    { n: 19, courts: 5 },
    { n: 21, courts: 10 },
    { n: 22, courts: 3 },
    { n: 23, courts: 7 },
    { n: 26, courts: 9 },
    { n: 27, courts: 4 },
    { n: 30, courts: 11 },
    { n: 31, courts: 6 },
  ];

  for (const mode of genderModes) {
    for (const { n, courts } of dynamicCourtMismatches) {
      if (mode === 'MIX_PAIRS' && n % 2 !== 0) continue;
      const uidList = ids.slice(0, n);
      const { parts, genderByUser } = assignGendersForMode(uidList, mode);
      const label = `mexicano edge dynamic ${mode} n=${n} courts=${courts}`;
      const game = baseGameFields(parts, courtIds(courts), mode === 'ANY' ? 'ANY' : mode);
      const minOk = 2 * n;
      runSequentialMexicanoRounds(label, game, genderByUser, minOk, maxAttemptsFor(minOk));
    }
  }

  const fixedCourtMismatches: { teamCount: number; courts: number }[] = [
    { teamCount: 5, courts: 4 },
    { teamCount: 6, courts: 5 },
    { teamCount: 7, courts: 6 },
    { teamCount: 9, courts: 8 },
    { teamCount: 10, courts: 3 },
    { teamCount: 11, courts: 10 },
    { teamCount: 13, courts: 4 },
    { teamCount: 14, courts: 9 },
    { teamCount: 15, courts: 5 },
  ];

  for (const mode of genderModes) {
    for (const { teamCount, courts } of fixedCourtMismatches) {
      const need = teamCount * 2;
      const pool = ids.slice(0, need);
      const teams: string[][] = [];
      for (let t = 0; t < teamCount; t++) {
        teams.push([pool[t * 2]!, pool[t * 2 + 1]!]);
      }

      const { parts, genderByUser } = assignGendersForMode(pool, mode);
      for (let ti = 0; ti < teams.length; ti++) {
        const [a, b] = teams[ti]!;
        if (mode === 'MIX_PAIRS') {
          genderByUser.set(a, 'MALE');
          genderByUser.set(b, 'FEMALE');
          parts[ti * 2] = mkParticipant(a, 'MALE', 3 + (ti % 5));
          parts[ti * 2 + 1] = mkParticipant(b, 'FEMALE', 3 + (ti % 5));
        }
      }

      const fixedTeams: NonNullable<GenGame['fixedTeams']> = teams.map((pair, idx) => ({
        id: `qa-mex-ft-edge-${teamCount}-${courts}-${idx}-${randomUUID().slice(0, 6)}`,
        teamNumber: idx + 1,
        players: pair.map((userId) => ({
          userId,
          user: mkUser(userId, genderByUser.get(userId)!, 3 + (idx % 5)),
        })),
      }));

      for (const allowMulti of [false, true] as const) {
        const label = `mexicano edge fixed ${mode} teams=${teamCount} courts=${courts} allowMulti=${allowMulti}`;
        const game = baseGameFields(parts, courtIds(courts), mode === 'ANY' ? 'ANY' : mode, {
          hasFixedTeams: true,
          allowUserInMultipleTeams: allowMulti,
          fixedTeams,
        });
        const minOk = 2 * teamCount;
        runSequentialMexicanoRounds(label, game, genderByUser, minOk, maxAttemptsFor(minOk));
      }
    }
  }

  {
    const [u1, u2, u3, u4, u5, u6] = ids;
    const overlapTeams: string[][] = [
      [u1!, u2!],
      [u1!, u3!],
      [u4!, u5!],
      [u6!, u2!],
    ];
    const genderByUser = new Map<string, Gender>();
    for (const id of [u1, u2, u3, u4, u5, u6]) {
      genderByUser.set(id!, 'MALE');
    }
    const parts = [u1, u2, u3, u4, u5, u6].map((id, i) => mkParticipant(id!, 'MALE', 4 + i));
    const fixedTeams: NonNullable<GenGame['fixedTeams']> = overlapTeams.map((pair, idx) => ({
      id: `qa-mex-ft-ov-${idx}`,
      teamNumber: idx + 1,
      players: pair.map((userId) => ({ userId, user: mkUser(userId, 'MALE', 4 + idx) })),
    }));
    const game = baseGameFields(parts, courtIds(2), 'ANY', {
      hasFixedTeams: true,
      allowUserInMultipleTeams: true,
      fixedTeams,
    });
    runSequentialMexicanoRounds('mexicano fixed overlap allowMulti=true 4 teams', game, genderByUser, 8, 120);
  }

  console.log('qa-mexicanoRoundGeneration: all checks passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
