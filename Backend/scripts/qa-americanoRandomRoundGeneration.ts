/**
 * QA: Americano (matchGenerationType RANDOM) round generator. Run:
 *   DB_URL=... npx ts-node scripts/qa-americanoRandomRoundGeneration.ts
 */
import { randomUUID } from 'crypto';
import type { GenGame, GenMatch, GenRound } from '../src/services/results/generation/types';
import { generateRandomRound } from '../src/services/results/generation/random';
import {
  buildOpponentCounts,
  buildPartnerCounts,
  getEligibleParticipants,
  getFilteredFixedTeams,
  getNumMatches,
  pairKey,
  rosterMultisetKey,
  shuffle,
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

function mkUser(id: string, gender: Gender) {
  return { id, level: 4, gender, firstName: 'Q', lastName: 'A' };
}

function mkParticipant(userId: string, gender: Gender) {
  const u = mkUser(userId, gender);
  return { userId, status: 'PLAYING', user: u };
}

const initialSets = [{ teamA: 0, teamB: 0, isTieBreak: false as const }];

function courtIds(n: number): { courtId: string; order: number }[] {
  return Array.from({ length: n }, (_, i) => ({ courtId: `qa-court-${i}-${randomUUID().slice(0, 8)}`, order: i }));
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
      cross.add(pairKey(a, b));
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

/**
 * Dynamic americano (non-fixed), every round has m padel matches → 4m players on court.
 * Each match has two teammate pairs → 2m teammate pair **events** per round (unordered player pairs).
 * Each match has four cross-side opponent links → 4m opponent pair **events** per round.
 * There are C(n,2) unordered player pairs among n eligible players.
 *
 * Pigeonhole: after r rounds the multiset of teammate events has size r·2m. Any assignment of these
 * events to C(n,2) bins forces some bin to hold at least ceil(r·2m / C(n,2)) events — that is the
 * **minimum possible** value of max-partner-count. A fair scheduler should stay close to this.
 * Example n=16, m=4: C=120, 2m=8 → r=15 gives 120 events → ceil(120/120)=1 (still possible that every
 * teammate pair is unique); r=16 gives 128 → ceil(128/120)=2 so some partner pair must repeat by then.
 *
 * Opponents: r·4m opponent events; ideal min-max load ceil(r·4m / C(n,2)) (same bin model).
 */
function totalUndirectedPairs(n: number): number {
  return (n * (n - 1)) / 2;
}

/** Rounds to use each unordered teammate pair at most once (pigeonhole). */
function fullPartnerCycleRounds(nEligible: number, matchesPerRound: number): number {
  if (matchesPerRound <= 0) return 0;
  return Math.floor(totalUndirectedPairs(nEligible) / (2 * matchesPerRound));
}

function twoFullPartnerCirclesRounds(nEligible: number, matchesPerRound: number): number {
  return 2 * fullPartnerCycleRounds(nEligible, matchesPerRound);
}

/** Fixed teams: one "circle" = each team pairing used once as opponents. */
function fullFixedTeamOpponentCycleRounds(teamCount: number, matchesPerRound: number): number {
  if (matchesPerRound <= 0 || teamCount < 2) return 0;
  return Math.floor(totalUndirectedPairs(teamCount) / matchesPerRound);
}

function fairnessSlackFor(n: number, m: number): { partnerSlack: number; opponentSlack: number } {
  if (n <= 7) return { partnerSlack: 1, opponentSlack: 4 };
  if (n <= 10) return { partnerSlack: 1, opponentSlack: 3 };
  if (m >= 4) return { partnerSlack: 2, opponentSlack: 4 };
  if (m >= 3) return { partnerSlack: 1, opponentSlack: 3 };
  return { partnerSlack: 1, opponentSlack: 2 };
}

/** Slack for 2× partner-circle runs — reuse is required, so allow more spread than short fairness runs. */
function fairnessSlackForTwoCircles(n: number, m: number): { partnerSlack: number; opponentSlack: number } {
  const oneCycle = fullPartnerCycleRounds(n, m);
  return {
    partnerSlack: Math.max(2, oneCycle),
    opponentSlack: Math.max(4, oneCycle + 2),
  };
}

function fairnessSlackForTwoFixedCircles(teamCount: number, m: number): {
  partnerSlack: number;
  opponentSlack: number;
} {
  const oneCycle = fullFixedTeamOpponentCycleRounds(teamCount, m);
  return {
    partnerSlack: Number.MAX_SAFE_INTEGER,
    opponentSlack: Math.max(4, oneCycle + 2),
  };
}

function minPossibleMaxLoad(totalEvents: number, numBins: number): number {
  if (numBins <= 0 || totalEvents <= 0) return 0;
  return Math.ceil(totalEvents / numBins);
}

function maxMapValue(m: Map<string, number>): number {
  let x = 0;
  for (const v of m.values()) if (v > x) x = v;
  return x;
}

/** Σ_v c(v)·(c(v)−1)/2 — 0 when no repeats, grows when the same pair meets again in that role. */
function repeatPairWeight(m: Map<string, number>): number {
  let w = 0;
  for (const c of m.values()) {
    if (c > 1) w += (c * (c - 1)) / 2;
  }
  return w;
}

function assertScheduleFairness(
  label: string,
  round1Based: number,
  rounds: GenRound[],
  nEligible: number,
  matchesPerRound: number,
  partnerSlack: number,
  opponentSlack: number,
) {
  const S = totalUndirectedPairs(nEligible);
  const m = matchesPerRound;
  const partnerEvents = round1Based * 2 * m;
  const oppEvents = round1Based * 4 * m;
  const partnerFloor = minPossibleMaxLoad(partnerEvents, S);
  const oppFloor = minPossibleMaxLoad(oppEvents, S);
  const pc = buildPartnerCounts(rounds);
  const oc = buildOpponentCounts(rounds);
  const maxP = maxMapValue(pc);
  const maxO = maxMapValue(oc);
  if (maxP > partnerFloor + partnerSlack) {
    throw new Error(
      `${label} r${round1Based}: max teammate pair count ${maxP} > ${partnerFloor + partnerSlack} ` +
        `(pigeonhole floor ${partnerFloor}, partner-events ${partnerEvents}, C(n,2)=${S})`,
    );
  }
  if (maxO > oppFloor + opponentSlack) {
    throw new Error(
      `${label} r${round1Based}: max opponent pair count ${maxO} > ${oppFloor + opponentSlack} ` +
        `(pigeonhole floor ${oppFloor}, opponent-events ${oppEvents}, C(n,2)=${S})`,
    );
  }
  if (maxP < partnerFloor) {
    throw new Error(
      `${label} r${round1Based}: max partner ${maxP} < pigeonhole floor ${partnerFloor} (counting bug?)`,
    );
  }
  if (maxO < oppFloor) {
    throw new Error(
      `${label} r${round1Based}: max opponent ${maxO} < pigeonhole floor ${oppFloor} (counting bug?)`,
    );
  }
}

function runFairnessSchedule(
  label: string,
  game: GenGame,
  genderByUser: Map<string, Gender>,
  maxRounds: number,
  minRounds: number,
  partnerSlack: number,
  opponentSlack: number,
) {
  const elig = getEligibleParticipants(game);
  const m = getNumMatches(game, elig);
  if (m === 0) throw new Error(`${label}: m=0`);
  const n = elig.length;
  const S = totalUndirectedPairs(n);
  const partnerCapRounds = Math.floor(S / (2 * m));
  const rounds: GenRound[] = [];
  for (let r = 0; r < maxRounds; r++) {
    const matches = generateRandomRound(game, rounds, initialSets);
    if (matches.length === 0) break;
    validateRound(label, game, rounds, matches, r, genderByUser);
    rounds.push({ id: `qa-fair-${r}`, matches });
    assertScheduleFairness(label, r + 1, rounds, n, m, partnerSlack, opponentSlack);
  }
  if (rounds.length < minRounds) {
    throw new Error(
      `${label}: fairness run dry too early (${rounds.length} rounds, min ${minRounds}); ` +
        `theory partner-cap≈${partnerCapRounds}`,
    );
  }
  const pc = buildPartnerCounts(rounds);
  const oc = buildOpponentCounts(rounds);
  const wP = repeatPairWeight(pc);
  const wO = repeatPairWeight(oc);
  const lastR = rounds.length;
  const pf = minPossibleMaxLoad(lastR * 2 * m, S);
  const of = minPossibleMaxLoad(lastR * 4 * m, S);
  console.log(
    `ok: ${label} — ${lastR} rounds (cap≈${maxRounds}), n=${n} m=${m}, C=${S}, ` +
      `theory full-unique partner rounds≤${partnerCapRounds}, ` +
      `end pigeonhole maxP≥${pf} maxO≥${of} actual maxP=${maxMapValue(pc)} maxO=${maxMapValue(oc)}, ` +
      `repeat-weights partner=${wP} opponent=${wO}`,
  );
}

function runSequentialRoundsUntilDry(
  label: string,
  game: GenGame,
  genderByUser: Map<string, Gender>,
  minSuccessfulRounds: number,
  maxAttempts: number,
) {
  runSequentialRoundsWithFairness(
    label,
    game,
    genderByUser,
    minSuccessfulRounds,
    maxAttempts,
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER,
  );
}

function runSequentialRoundsWithFairness(
  label: string,
  game: GenGame,
  genderByUser: Map<string, Gender>,
  minSuccessfulRounds: number,
  maxAttempts: number,
  partnerSlack: number,
  opponentSlack: number,
  existingRounds: GenRound[] = [],
) {
  const elig = getEligibleParticipants(game);
  const m = getNumMatches(game, elig);
  if (m === 0) throw new Error(`${label}: m=0`);
  const n = elig.length;
  const rounds: GenRound[] = [...existingRounds];
  const skipFairness = partnerSlack >= Number.MAX_SAFE_INTEGER / 2;
  let r = rounds.length;
  for (; r < maxAttempts; r++) {
    const matches = generateRandomRound(game, rounds, initialSets);
    if (matches.length === 0) break;
    validateRound(label, game, rounds, matches, r, genderByUser);
    rounds.push({ id: `qa-r${r}`, matches });
    if (!skipFairness) {
      assertScheduleFairness(label, r + 1, rounds, n, m, partnerSlack, opponentSlack);
    }
  }
  if (rounds.length < minSuccessfulRounds) {
    throw new Error(
      `${label}: expected >= ${minSuccessfulRounds} successful rounds, got ${rounds.length} (stopped attempt ${r})`,
    );
  }
  const fairnessNote = skipFairness ? '' : ', fairness checked each round';
  console.log(`ok: ${label} (${rounds.length} rounds${fairnessNote})`);
  return rounds;
}

function runTwoFullPartnerCirclesTest(
  label: string,
  game: GenGame,
  genderByUser: Map<string, Gender>,
) {
  const elig = getEligibleParticipants(game);
  const m = getNumMatches(game, elig);
  const n = elig.length;
  if (m === 0) throw new Error(`${label}: m=0 (n=${n})`);

  const oneCycle = fullPartnerCycleRounds(n, m);
  const minRounds = twoFullPartnerCirclesRounds(n, m);
  if (minRounds < 2) {
    throw new Error(`${label}: need >=2 rounds for 2 circles, got min=${minRounds} (n=${n} m=${m})`);
  }

  const slack = fairnessSlackForTwoCircles(n, m);
  const maxAttempts = minRounds + Math.max(6, Math.ceil(minRounds * 0.25));
  const rounds = runSequentialRoundsWithFairness(
    label,
    game,
    genderByUser,
    minRounds,
    maxAttempts,
    slack.partnerSlack,
    slack.opponentSlack,
  );

  if (oneCycle >= 1) {
    const afterFirstCycle = generateRandomRound(game, rounds.slice(0, oneCycle), initialSets);
    if (afterFirstCycle.length === 0) {
      throw new Error(
        `${label}: dry at round ${oneCycle + 1} right after first full partner cycle (n=${n} m=${m})`,
      );
    }
    validateRound(label, game, rounds.slice(0, oneCycle), afterFirstCycle, oneCycle, genderByUser);
  }

  console.log(
    `ok: ${label} — 2× partner circles (${minRounds} rounds, 1-cycle=${oneCycle}, C=${totalUndirectedPairs(n)})`,
  );
}

function runTwoFullFixedTeamOpponentCirclesTest(
  label: string,
  game: GenGame,
  genderByUser: Map<string, Gender>,
) {
  const elig = getEligibleParticipants(game);
  const m = getNumMatches(game, elig);
  const teamCount = getFilteredFixedTeams(game).length;
  if (m === 0) throw new Error(`${label}: m=0`);
  if (teamCount < 4) throw new Error(`${label}: need >=4 fixed teams, got ${teamCount}`);

  const oneCycle = fullFixedTeamOpponentCycleRounds(teamCount, m);
  const minRounds = 2 * oneCycle;
  if (minRounds < 2) {
    throw new Error(`${label}: minRounds ${minRounds} too small (teams=${teamCount} m=${m})`);
  }

  const slack = fairnessSlackForTwoFixedCircles(teamCount, m);
  const maxAttempts = minRounds + Math.max(8, Math.ceil(minRounds * 0.3));
  const rounds = runSequentialRoundsWithFairness(
    label,
    game,
    genderByUser,
    minRounds,
    maxAttempts,
    slack.partnerSlack,
    slack.opponentSlack,
  );

  if (oneCycle >= 1) {
    const afterFirstCycle = generateRandomRound(game, rounds.slice(0, oneCycle), initialSets);
    if (afterFirstCycle.length === 0) {
      throw new Error(
        `${label}: dry at round ${oneCycle + 1} after first full team-opponent cycle (teams=${teamCount} m=${m})`,
      );
    }
    validateRound(label, game, rounds.slice(0, oneCycle), afterFirstCycle, oneCycle, genderByUser);
  }

  console.log(
    `ok: ${label} — 2× team-opponent circles (${minRounds} rounds, 1-cycle=${oneCycle}, teams=${teamCount})`,
  );
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
      parts.push(mkParticipant(id, g));
    }
  } else if (mode === 'MEN') {
    for (const id of userIds) {
      genderByUser.set(id, 'MALE');
      parts.push(mkParticipant(id, 'MALE'));
    }
  } else if (mode === 'WOMEN') {
    for (const id of userIds) {
      genderByUser.set(id, 'FEMALE');
      parts.push(mkParticipant(id, 'FEMALE'));
    }
  } else {
    for (const id of userIds) {
      genderByUser.set(id, 'MALE');
      parts.push(mkParticipant(id, 'MALE'));
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
    matchGenerationType: 'RANDOM',
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
    playersPerMatch: 4,
  };
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
    throw new Error('need at least 52 User rows (24 teams × 2 + overlap QA buffer)');
  }
  const ids = users.map((u) => u.id);

  const genderModes = ['ANY', 'MEN', 'WOMEN', 'MIX_PAIRS'] as const;

  for (const mode of genderModes) {
    for (let n = 4; n <= 32; n++) {
      if (mode === 'MIX_PAIRS' && n % 2 !== 0) continue;
      const uidList = ids.slice(0, n);
      const { parts, genderByUser } = assignGendersForMode(uidList, mode);
      for (const numCourts of new Set([1, Math.min(4, Math.max(1, Math.floor(n / 4)))])) {
        const label = `dynamic ${mode} n=${n} courts=${numCourts}`;
        const game = baseGameFields(parts, courtIds(numCourts), mode === 'ANY' ? 'ANY' : mode);
        const minOk = Math.max(3, Math.min(14, Math.floor(n / 3)));
        runSequentialRoundsUntilDry(label, game, genderByUser, minOk, 45);
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
          parts[ti * 2] = mkParticipant(a, 'MALE');
          parts[ti * 2 + 1] = mkParticipant(b, 'FEMALE');
        }
      }

      const fixedTeams: NonNullable<GenGame['fixedTeams']> = teams.map((pair, idx) => ({
        id: `qa-ft-${teamCount}-${idx}-${randomUUID().slice(0, 6)}`,
        teamNumber: idx + 1,
        players: pair.map((userId) => ({
          userId,
          user: mkUser(userId, genderByUser.get(userId)!),
        })),
      }));

      for (const allowMulti of [false, true] as const) {
        const numCourts = new Set([1, Math.min(4, Math.max(1, Math.floor((teamCount * 2) / 4)))]);
        for (const nc of numCourts) {
          const label = `fixed ${mode} teams=${teamCount} allowMulti=${allowMulti} courts=${nc}`;
          const game = baseGameFields(parts, courtIds(nc), mode === 'ANY' ? 'ANY' : mode, {
            hasFixedTeams: true,
            allowUserInMultipleTeams: allowMulti,
            fixedTeams,
          });
          const minOk = Math.max(4, Math.min(16, Math.floor(teamCount / 2)));
          runSequentialRoundsUntilDry(label, game, genderByUser, minOk, 50);
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
      const label = `edge dynamic ${mode} n=${n} courts=${courts} (mismatch / n%4=${n % 4})`;
      const game = baseGameFields(parts, courtIds(courts), mode === 'ANY' ? 'ANY' : mode);
      const elig = getEligibleParticipants(game);
      const cap = getNumMatches(game, elig);
      const minOk = Math.max(2, Math.min(12, Math.max(3, cap * 2)));
      runSequentialRoundsUntilDry(label, game, genderByUser, minOk, 45);
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
          parts[ti * 2] = mkParticipant(a, 'MALE');
          parts[ti * 2 + 1] = mkParticipant(b, 'FEMALE');
        }
      }

      const fixedTeams: NonNullable<GenGame['fixedTeams']> = teams.map((pair, idx) => ({
        id: `qa-ft-edge-${teamCount}-${courts}-${idx}-${randomUUID().slice(0, 6)}`,
        teamNumber: idx + 1,
        players: pair.map((userId) => ({
          userId,
          user: mkUser(userId, genderByUser.get(userId)!),
        })),
      }));

      const players = need;
      for (const allowMulti of [false, true] as const) {
        const label = `edge fixed ${mode} teams=${teamCount} players=${players} courts=${courts} allowMulti=${allowMulti} (players%4=${players % 4})`;
        const game = baseGameFields(parts, courtIds(courts), mode === 'ANY' ? 'ANY' : mode, {
          hasFixedTeams: true,
          allowUserInMultipleTeams: allowMulti,
          fixedTeams,
        });
        const elig = getEligibleParticipants(game);
        const cap = getNumMatches(game, elig);
        const minOk = Math.max(3, Math.min(14, Math.max(4, cap * 2)));
        runSequentialRoundsUntilDry(label, game, genderByUser, minOk, 50);
      }
    }
  }

  // 2+ full partner circles: dynamic americano across n / courts / gender (fairness each round).
  const twoCircleDynamic: {
    n: number;
    courts: number;
    gender: 'ANY' | 'MEN' | 'WOMEN' | 'MIX_PAIRS';
  }[] = [
    { n: 5, courts: 1, gender: 'ANY' },
    { n: 6, courts: 1, gender: 'ANY' },
    { n: 7, courts: 1, gender: 'ANY' },
    { n: 8, courts: 1, gender: 'ANY' },
    { n: 8, courts: 2, gender: 'ANY' },
    { n: 9, courts: 2, gender: 'ANY' },
    { n: 10, courts: 2, gender: 'ANY' },
    { n: 10, courts: 4, gender: 'ANY' },
    { n: 11, courts: 2, gender: 'ANY' },
    { n: 12, courts: 3, gender: 'ANY' },
    { n: 13, courts: 3, gender: 'ANY' },
    { n: 14, courts: 3, gender: 'ANY' },
    { n: 15, courts: 3, gender: 'ANY' },
    { n: 16, courts: 3, gender: 'ANY' },
    { n: 16, courts: 4, gender: 'ANY' },
    { n: 16, courts: 5, gender: 'ANY' },
    { n: 18, courts: 4, gender: 'ANY' },
    { n: 20, courts: 4, gender: 'ANY' },
    { n: 20, courts: 5, gender: 'ANY' },
    { n: 24, courts: 6, gender: 'ANY' },
    { n: 12, courts: 3, gender: 'MEN' },
    { n: 12, courts: 3, gender: 'WOMEN' },
    { n: 16, courts: 3, gender: 'MIX_PAIRS' },
    { n: 16, courts: 4, gender: 'MIX_PAIRS' },
    { n: 20, courts: 4, gender: 'MIX_PAIRS' },
    { n: 24, courts: 6, gender: 'MIX_PAIRS' },
  ];

  for (const { n, courts, gender } of twoCircleDynamic) {
    if (gender === 'MIX_PAIRS' && n % 2 !== 0) continue;
    const uidList = ids.slice(0, n);
    const { parts, genderByUser } = assignGendersForMode(uidList, gender);
    const game = baseGameFields(parts, courtIds(courts), gender);
    const label = `2 circles dynamic ${gender} n=${n} courts=${courts}`;
    runTwoFullPartnerCirclesTest(label, game, genderByUser);
  }

  const twoCircleFixed: {
    teamCount: number;
    courts: number;
    gender: 'ANY' | 'MEN' | 'WOMEN' | 'MIX_PAIRS';
    allowMulti: boolean;
  }[] = [
    { teamCount: 6, courts: 1, gender: 'ANY', allowMulti: false },
    { teamCount: 6, courts: 2, gender: 'ANY', allowMulti: false },
    { teamCount: 8, courts: 2, gender: 'ANY', allowMulti: false },
    { teamCount: 10, courts: 2, gender: 'ANY', allowMulti: false },
    { teamCount: 10, courts: 4, gender: 'ANY', allowMulti: false },
    { teamCount: 12, courts: 3, gender: 'ANY', allowMulti: false },
    { teamCount: 14, courts: 3, gender: 'ANY', allowMulti: false },
    { teamCount: 16, courts: 3, gender: 'ANY', allowMulti: false },
    { teamCount: 16, courts: 4, gender: 'ANY', allowMulti: false },
    { teamCount: 12, courts: 3, gender: 'MEN', allowMulti: false },
    { teamCount: 12, courts: 3, gender: 'WOMEN', allowMulti: false },
    { teamCount: 16, courts: 4, gender: 'MIX_PAIRS', allowMulti: false },
    { teamCount: 8, courts: 2, gender: 'ANY', allowMulti: true },
    { teamCount: 10, courts: 3, gender: 'ANY', allowMulti: true },
  ];

  for (const { teamCount, courts, gender, allowMulti } of twoCircleFixed) {
    const need = teamCount * 2;
    const pool = ids.slice(0, need);
    const teams: string[][] = [];
    for (let t = 0; t < teamCount; t++) {
      teams.push([pool[t * 2]!, pool[t * 2 + 1]!]);
    }
    const { parts, genderByUser } = assignGendersForMode(pool, gender);
    if (gender === 'MIX_PAIRS') {
      for (let ti = 0; ti < teams.length; ti++) {
        const [a, b] = teams[ti]!;
        genderByUser.set(a, 'MALE');
        genderByUser.set(b, 'FEMALE');
        parts[ti * 2] = mkParticipant(a, 'MALE');
        parts[ti * 2 + 1] = mkParticipant(b, 'FEMALE');
      }
    }
    const fixedTeams: NonNullable<GenGame['fixedTeams']> = teams.map((pair, idx) => ({
      id: `qa-2c-ft-${teamCount}-${courts}-${idx}-${randomUUID().slice(0, 6)}`,
      teamNumber: idx + 1,
      players: pair.map((userId) => ({
        userId,
        user: mkUser(userId, genderByUser.get(userId)!),
      })),
    }));
    const game = baseGameFields(parts, courtIds(courts), gender, {
      hasFixedTeams: true,
      allowUserInMultipleTeams: allowMulti,
      fixedTeams,
    });
    const label = `2 circles fixed ${gender} teams=${teamCount} courts=${courts} allowMulti=${allowMulti}`;
    runTwoFullFixedTeamOpponentCirclesTest(label, game, genderByUser);
  }

  const fairnessRuns: {
    n: number;
    courts: number;
    maxRounds: number;
    minRounds: number;
    partnerSlack: number;
    opponentSlack: number;
  }[] = [
    // n=16,m=4: maxO can reach 5 while pigeonhole floor is 2 — opponentSlack 3 covers stochastic pairing.
    { n: 16, courts: 4, maxRounds: 20, minRounds: 14, partnerSlack: 1, opponentSlack: 3 },
    { n: 12, courts: 3, maxRounds: 16, minRounds: 10, partnerSlack: 1, opponentSlack: 3 },
    { n: 8, courts: 2, maxRounds: 12, minRounds: 6, partnerSlack: 1, opponentSlack: 2 },
    { n: 14, courts: 3, maxRounds: 16, minRounds: 8, partnerSlack: 2, opponentSlack: 3 },
    { n: 18, courts: 4, maxRounds: 18, minRounds: 10, partnerSlack: 2, opponentSlack: 3 },
  ];

  for (const fr of fairnessRuns) {
    for (let trial = 0; trial < 2; trial++) {
      const uidList = shuffle(ids.slice(0, fr.n));
      const { parts, genderByUser } = assignGendersForMode(uidList, 'ANY');
      const label = `fairness ANY trial=${trial} n=${fr.n} courts=${fr.courts}`;
      const game = baseGameFields(parts, courtIds(fr.courts), 'ANY');
      runFairnessSchedule(
        label,
        game,
        genderByUser,
        fr.maxRounds,
        fr.minRounds,
        fr.partnerSlack,
        fr.opponentSlack,
      );
    }
  }

  for (let trial = 0; trial < 2; trial++) {
    const uidList = shuffle(ids.slice(0, 16));
    const { parts, genderByUser } = assignGendersForMode(uidList, 'MIX_PAIRS');
    const label = `fairness MIX_PAIRS trial=${trial} n=16 courts=4`;
    const game = baseGameFields(parts, courtIds(4), 'MIX_PAIRS');
    runFairnessSchedule(label, game, genderByUser, 20, 14, 2, 3);
  }

  for (let trial = 0; trial < 3; trial++) {
    const uidList = shuffle(ids.slice(0, 16));
    const { parts, genderByUser } = assignGendersForMode(uidList, 'ANY');
    const game = baseGameFields(parts, courtIds(4), 'ANY');
    const elig = getEligibleParticipants(game);
    const m = getNumMatches(game, elig);
    const n = elig.length;
    const rounds: GenRound[] = [];
    const label = `fairness strict-15 n=16 m=4 trial=${trial}`;
    while (rounds.length < 15) {
      const matches = generateRandomRound(game, rounds, initialSets);
      if (matches.length === 0) throw new Error(`${label}: dry before 15 rounds at ${rounds.length}`);
      validateRound(label, game, rounds, matches, rounds.length, genderByUser);
      rounds.push({ id: `qa-strict-${rounds.length}`, matches });
      assertScheduleFairness(label, rounds.length, rounds, n, m, 1, 3);
    }
    console.log(
      `ok: ${label} — 15 rounds within fairness slack (theory: at r=16 partner-events 128 > C(n,2)=120)`,
    );
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
    const parts = [u1, u2, u3, u4, u5, u6].map((id) => mkParticipant(id!, 'MALE'));
    const fixedTeams: NonNullable<GenGame['fixedTeams']> = overlapTeams.map((pair, idx) => ({
      id: `qa-ft-ov-${idx}`,
      teamNumber: idx + 1,
      players: pair.map((userId) => ({ userId, user: mkUser(userId, 'MALE') })),
    }));
    const game = baseGameFields(parts, courtIds(2), 'ANY', {
      hasFixedTeams: true,
      allowUserInMultipleTeams: true,
      fixedTeams,
    });
    runSequentialRoundsUntilDry('fixed overlap allowMulti=true 4 teams', game, genderByUser, 12, 45);
  }

  console.log('qa-americanoRandomRoundGeneration: all checks passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
