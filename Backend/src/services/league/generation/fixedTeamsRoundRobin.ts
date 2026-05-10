/** Single round-robin: circle method. Even n → n−1 rounds; odd n → n rounds (bye each round). */

function rotateEvenCircle(teams: number[]): void {
  const last = teams.pop()!;
  teams.splice(1, 0, last);
}

function teamOrderAfterRotations(teamCount: number, roundIndex: number): number[] {
  const teams = Array.from({ length: teamCount }, (_, i) => i);
  const r = roundIndex;
  for (let k = 0; k < r; k++) {
    rotateEvenCircle(teams);
  }
  return teams;
}

export function roundsInSingleRoundRobinCycle(teamCount: number): number {
  if (teamCount < 2) return 0;
  return teamCount % 2 === 0 ? teamCount - 1 : teamCount;
}

/** Pair indices into sorted team list for this round slot (0-based within one full RR cycle). */
export function pairIndicesForRoundRobinSlot(teamCount: number, roundSlot: number): [number, number][] {
  if (teamCount < 2) return [];
  const cycle = roundsInSingleRoundRobinCycle(teamCount);
  const slot = ((roundSlot % cycle) + cycle) % cycle;

  if (teamCount % 2 === 0) {
    const order = teamOrderAfterRotations(teamCount, slot);
    const matches: [number, number][] = [];
    for (let i = 0; i < teamCount / 2; i++) {
      matches.push([order[i], order[teamCount - 1 - i]]);
    }
    return matches;
  }

  const m = teamCount + 1;
  const order = teamOrderAfterRotations(m, slot);
  const matches: [number, number][] = [];
  for (let i = 0; i < m / 2; i++) {
    const a = order[i];
    const b = order[m - 1 - i];
    if (a < teamCount && b < teamCount) {
      matches.push([a, b]);
    }
  }
  return matches;
}
