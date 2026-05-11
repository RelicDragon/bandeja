import type { Match, Round, SetResult } from '@/types/gameResults';
import type { MatchTimerSnapshot } from '@/utils/matchTimer';

function stringArraysEqual(a: string[], b: string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function setsEqual(a: SetResult, b: SetResult): boolean {
  if (a === b) return true;
  return (
    a.teamA === b.teamA &&
    a.teamB === b.teamB &&
    !!a.isTieBreak === !!b.isTieBreak &&
    (a.role ?? null) === (b.role ?? null) &&
    (a.id ?? null) === (b.id ?? null)
  );
}

function setArraysEqual(a: SetResult[], b: SetResult[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!setsEqual(a[i], b[i])) return false;
  }
  return true;
}

function timersEqual(a?: MatchTimerSnapshot, b?: MatchTimerSnapshot): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.status === b.status &&
    a.startedAt === b.startedAt &&
    a.pausedAt === b.pausedAt &&
    a.elapsedMs === b.elapsedMs &&
    a.capMinutes === b.capMinutes &&
    a.expiresAt === b.expiresAt
  );
}

function matchesEqual(a: Match, b: Match): boolean {
  if (a === b) return true;
  if (a.id !== b.id) return false;
  if ((a.courtId ?? null) !== (b.courtId ?? null)) return false;
  if ((a.winnerId ?? null) !== (b.winnerId ?? null)) return false;
  if ((a.fixedTeamIdA ?? null) !== (b.fixedTeamIdA ?? null)) return false;
  if ((a.fixedTeamIdB ?? null) !== (b.fixedTeamIdB ?? null)) return false;
  if (!stringArraysEqual(a.teamA, b.teamA)) return false;
  if (!stringArraysEqual(a.teamB, b.teamB)) return false;
  if (!setArraysEqual(a.sets, b.sets)) return false;
  if (!timersEqual(a.timer, b.timer)) return false;
  return true;
}

function mergeMatch(current: Match | undefined, next: Match): Match {
  if (!current) return next;
  if (matchesEqual(current, next)) return current;

  const teamA = stringArraysEqual(current.teamA, next.teamA) ? current.teamA : next.teamA;
  const teamB = stringArraysEqual(current.teamB, next.teamB) ? current.teamB : next.teamB;
  const sets = setArraysEqual(current.sets, next.sets) ? current.sets : next.sets;
  const timer = timersEqual(current.timer, next.timer) ? current.timer : next.timer;

  return {
    ...current,
    ...next,
    teamA,
    teamB,
    sets,
    timer,
  };
}

function mergeMatches(current: Match[], next: Match[]): Match[] {
  if (current === next) return current;

  const currentById = new Map<string, Match>();
  for (const m of current) currentById.set(m.id, m);

  let changed = current.length !== next.length;
  const merged: Match[] = new Array(next.length);

  for (let i = 0; i < next.length; i++) {
    const nextM = next[i];
    const curM = currentById.get(nextM.id);
    const mergedM = mergeMatch(curM, nextM);
    merged[i] = mergedM;
    if (!changed && (curM !== mergedM || current[i]?.id !== nextM.id)) {
      changed = true;
    }
  }

  return changed ? merged : current;
}

function mergeRound(current: Round | undefined, next: Round): Round {
  if (!current) return next;
  const mergedMatches = mergeMatches(current.matches, next.matches);
  if (mergedMatches === current.matches) return current;
  return { ...current, matches: mergedMatches };
}

export function mergeRoundsPreservingIdentity(current: Round[], next: Round[]): Round[] {
  if (current === next) return current;

  const currentById = new Map<string, Round>();
  for (const r of current) currentById.set(r.id, r);

  let changed = current.length !== next.length;
  const merged: Round[] = new Array(next.length);

  for (let i = 0; i < next.length; i++) {
    const nextR = next[i];
    const curR = currentById.get(nextR.id);
    const mergedR = mergeRound(curR, nextR);
    merged[i] = mergedR;
    if (!changed && (curR !== mergedR || current[i]?.id !== nextR.id)) {
      changed = true;
    }
  }

  return changed ? merged : current;
}
