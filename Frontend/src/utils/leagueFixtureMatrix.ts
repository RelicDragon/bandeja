import type { BasicUser, Game } from '@/types';
import type { LeagueRound, LeagueStanding } from '@/api/leagues';

export function roundsInSingleRoundRobinCycle(teamCount: number): number {
  if (teamCount < 2) return 0;
  return teamCount % 2 === 0 ? teamCount - 1 : teamCount;
}

export function teamPlayerSig(playerIds: string[]): string {
  return [...playerIds].map(String).sort().join(',');
}

export function matchupKey(sigA: string, sigB: string): string {
  return sigA < sigB ? `${sigA}|${sigB}` : `${sigB}|${sigA}`;
}

export function sigFromFixedTeam(game: Game, teamNumber: 1 | 2): string | null {
  const ft = game.fixedTeams?.find((t) => t.teamNumber === teamNumber);
  if (!ft?.players?.length) return null;
  const ids = ft.players
    .map((p) => p.userId)
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
  if (ids.length !== 2) return null;
  return teamPlayerSig(ids);
}

export type CellOutcome = 'W' | 'L' | 'T' | null;

export function rowPerspectiveOutcome(
  game: Game,
  rowSig: string,
  colSig: string
): { outcome: CellOutcome; scoreHint: string | null } {
  if (rowSig === colSig) return { outcome: null, scoreHint: null };
  const s1 = sigFromFixedTeam(game, 1);
  const s2 = sigFromFixedTeam(game, 2);
  if (!s1 || !s2) return { outcome: null, scoreHint: null };

  const scheduled =
    Boolean(game.timeIsSet) && Boolean(game.clubId);
  const played = game.resultsStatus === 'FINAL' && (game.outcomes?.length ?? 0) > 0;

  if (played && game.outcomes) {
    const rowIds = rowSig.split(',');
    const rowOutcomes = game.outcomes.filter((o) => rowIds.includes(o.userId));
    if (rowOutcomes.length === 0) return { outcome: null, scoreHint: null };
    const allWinners = rowOutcomes.every((o) => o.isWinner);
    const noneWinners = rowOutcomes.every((o) => !o.isWinner);
    const tieish =
      noneWinners &&
      rowOutcomes.some((o) => (o.ties ?? 0) > 0) &&
      rowOutcomes.every((o) => !o.isWinner && (o.wins ?? 0) === 0 && (o.losses ?? 0) === 0);
    if (allWinners) return { outcome: 'W', scoreHint: null };
    if (tieish) return { outcome: 'T', scoreHint: null };
    if (noneWinners) return { outcome: 'L', scoreHint: null };
    return { outcome: rowOutcomes.some((o) => o.isWinner) ? 'W' : 'L', scoreHint: null };
  }

  if (scheduled) {
    return { outcome: null, scoreHint: 'live' };
  }

  return { outcome: null, scoreHint: null };
}

export interface MatrixTeam {
  leagueTeamId: string;
  participantId: string;
  sig: string;
  label: string;
  players: { userId: string; user?: BasicUser | null }[];
}

export function standingsTeamsForGroup(
  groupId: string,
  standings: LeagueStanding[]
): MatrixTeam[] {
  const out: MatrixTeam[] = [];
  for (const s of standings) {
    if (
      s.currentGroupId !== groupId ||
      s.participantType !== 'TEAM' ||
      !s.leagueTeam?.players ||
      s.leagueTeam.players.length !== 2
    ) {
      continue;
    }
    const players = s.leagueTeam.players;
    const ids = players
      .map((p) => p.userId)
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
    if (ids.length !== 2) continue;
    const u0 = players[0]?.user;
    const u1 = players[1]?.user;
    const label =
      [u0?.firstName, u0?.lastName].filter(Boolean).join(' ').trim() &&
      [u1?.firstName, u1?.lastName].filter(Boolean).join(' ').trim()
        ? `${[u0?.firstName, u0?.lastName].filter(Boolean).join(' ')} / ${[u1?.firstName, u1?.lastName].filter(Boolean).join(' ')}`
        : (s.leagueTeam.id ?? '').slice(0, 8);
    out.push({
      leagueTeamId: s.leagueTeam.id,
      participantId: s.id,
      sig: teamPlayerSig(ids),
      label,
      players: players.map((p) => ({ userId: p.userId as string, user: p.user })),
    });
  }
  return out.sort((a, b) => a.sig.localeCompare(b.sig));
}

export function aggregateSeasonWltForTeam(
  teamSig: string,
  rounds: LeagueRound[],
  groupId: string
): { w: number; l: number; t: number } {
  let w = 0;
  let l = 0;
  let t = 0;
  const regularGames = rounds
    .filter((r) => (r.roundType ?? 'REGULAR') === 'REGULAR')
    .flatMap((r) => r.games)
    .filter((g) => g.leagueGroupId === groupId && g.hasFixedTeams && g.resultsStatus === 'FINAL');

  for (const g of regularGames) {
    const s1 = sigFromFixedTeam(g, 1);
    const s2 = sigFromFixedTeam(g, 2);
    if (!s1 || !s2 || s1 === s2) continue;
    const opp = teamSig === s1 ? s2 : teamSig === s2 ? s1 : null;
    if (!opp) continue;
    const { outcome } = rowPerspectiveOutcome(g, teamSig, opp);
    if (outcome === 'W') w++;
    else if (outcome === 'L') l++;
    else if (outcome === 'T') t++;
  }
  return { w, l, t };
}

export type CellGames = { games: Game[] };

export function buildPairCellMap(
  rounds: LeagueRound[],
  groupId: string
): Map<string, Game[]> {
  const map = new Map<string, Game[]>();
  const regularGames = rounds
    .filter((r) => (r.roundType ?? 'REGULAR') === 'REGULAR')
    .flatMap((r) => r.games)
    .filter((g) => g.leagueGroupId === groupId && g.hasFixedTeams);

  for (const g of regularGames) {
    const s1 = sigFromFixedTeam(g, 1);
    const s2 = sigFromFixedTeam(g, 2);
    if (!s1 || !s2 || s1 === s2) continue;
    const key = matchupKey(s1, s2);
    const prev = map.get(key) ?? [];
    prev.push(g);
    map.set(key, prev);
  }
  return map;
}
