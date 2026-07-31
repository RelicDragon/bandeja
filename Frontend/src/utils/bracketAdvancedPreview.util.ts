import type { BracketMainRoundPreview } from '@/utils/bracketStructure';

export type BracketPreviewFeeder = {
  outcome: 'winner' | 'loser';
  match: string;
};

export type BracketAdvancedPreviewMatch = {
  id: string;
  feederA: BracketPreviewFeeder;
  feederB: BracketPreviewFeeder;
};

export type BracketAdvancedPreviewColumn = {
  id: string;
  roundNumber: number;
  matches: BracketAdvancedPreviewMatch[];
};

function roundCode(round: BracketMainRoundPreview): string {
  switch (round.labelKey) {
    case 'final':
      return 'F';
    case 'semifinals':
      return 'SF';
    case 'quarterfinals':
      return 'QF';
    case 'roundOf16':
      return 'R16-';
    case 'roundOf32':
      return 'R32-';
  }
}

function mainMatch(round: BracketMainRoundPreview, matchIndex: number): string {
  const code = roundCode(round);
  return round.labelKey === 'final' ? code : `${code}${matchIndex + 1}`;
}

function lowerMatch(roundIndex: number, matchIndex: number): string {
  return `LB${roundIndex + 1}-${matchIndex + 1}`;
}

export function buildConsolationPreviewColumns(
  mainRounds: BracketMainRoundPreview[]
): BracketAdvancedPreviewColumn[] {
  const firstRound = mainRounds[0];
  if (!firstRound || firstRound.matchCount < 2) return [];
  const columns: BracketAdvancedPreviewColumn[] = [];
  let sourceCount = firstRound.matchCount;
  let roundIndex = 0;

  while (sourceCount >= 2) {
    const matches = Array.from({ length: sourceCount / 2 }, (_, matchIndex) => ({
      id: `CONS-R${roundIndex}-M${matchIndex}`,
      feederA:
        roundIndex === 0
          ? { outcome: 'loser' as const, match: mainMatch(firstRound, matchIndex * 2) }
          : { outcome: 'winner' as const, match: `C${roundIndex}-${matchIndex * 2 + 1}` },
      feederB:
        roundIndex === 0
          ? { outcome: 'loser' as const, match: mainMatch(firstRound, matchIndex * 2 + 1) }
          : { outcome: 'winner' as const, match: `C${roundIndex}-${matchIndex * 2 + 2}` },
    }));
    columns.push({ id: `cons-${roundIndex}`, roundNumber: roundIndex + 1, matches });
    sourceCount /= 2;
    roundIndex += 1;
  }
  return columns;
}

export function buildDoubleEliminationPreviewColumns(
  mainRounds: BracketMainRoundPreview[]
): BracketAdvancedPreviewColumn[] {
  const firstRound = mainRounds[0];
  if (!firstRound || firstRound.matchCount < 2) return [];

  const columns: BracketAdvancedPreviewColumn[] = [];
  let lowerRoundIndex = 0;
  columns.push({
    id: 'losers-0',
    roundNumber: 1,
    matches: Array.from({ length: firstRound.matchCount / 2 }, (_, matchIndex) => ({
      id: `LOS-R0-M${matchIndex}`,
      feederA: { outcome: 'loser', match: mainMatch(firstRound, matchIndex * 2) },
      feederB: { outcome: 'loser', match: mainMatch(firstRound, matchIndex * 2 + 1) },
    })),
  });

  for (let winnersRoundIndex = 1; winnersRoundIndex < mainRounds.length; winnersRoundIndex++) {
    const winnersRound = mainRounds[winnersRoundIndex]!;
    const previousLowerRound = lowerRoundIndex;
    lowerRoundIndex += 1;
    columns.push({
      id: `losers-${lowerRoundIndex}`,
      roundNumber: lowerRoundIndex + 1,
      matches: Array.from({ length: winnersRound.matchCount }, (_, matchIndex) => {
        const crossedMainIndex =
          winnersRound.matchCount > 1 ? matchIndex ^ 1 : matchIndex;
        return {
          id: `LOS-R${lowerRoundIndex}-M${matchIndex}`,
          feederA: {
            outcome: 'winner',
            match: lowerMatch(previousLowerRound, matchIndex),
          },
          feederB: {
            outcome: 'loser',
            match: mainMatch(winnersRound, crossedMainIndex),
          },
        };
      }),
    });

    if (winnersRoundIndex < mainRounds.length - 1) {
      const injectionRound = lowerRoundIndex;
      lowerRoundIndex += 1;
      columns.push({
        id: `losers-${lowerRoundIndex}`,
        roundNumber: lowerRoundIndex + 1,
        matches: Array.from({ length: winnersRound.matchCount / 2 }, (_, matchIndex) => ({
          id: `LOS-R${lowerRoundIndex}-M${matchIndex}`,
          feederA: {
            outcome: 'winner',
            match: lowerMatch(injectionRound, matchIndex * 2),
          },
          feederB: {
            outcome: 'winner',
            match: lowerMatch(injectionRound, matchIndex * 2 + 1),
          },
        })),
      });
    }
  }
  return columns;
}
