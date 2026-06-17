import type { MatchExplanation } from '@/api/results';

export const getLevelChangeColor = (change: number) => {
  if (change > 0) return 'text-green-600 dark:text-green-400';
  if (change < 0) return 'text-red-600 dark:text-red-400';
  return 'text-gray-600 dark:text-gray-400';
};

export const getDecimals = (value: number) => {
  if (value === 0) return 2;
  const absValue = Math.abs(value);
  if (absValue < 0.01) {
    return Math.ceil(-Math.log10(absValue)) + 1;
  }
  return 2;
};

export const formatNumber = (value: number) => {
  const formatted = value.toFixed(getDecimals(value));
  const absValue = Math.abs(value);
  if (absValue < 0.1 && absValue > 0) {
    return formatted.replace(/0+$/, '').replace(/\.$/, '');
  }
  return formatted;
};

export const formatChange = (change: number) => {
  const formatted = formatNumber(change);
  return change > 0 ? `+${formatted}` : formatted;
};

export function groupMatchesByRound(matches: MatchExplanation[]) {
  const grouped = matches.reduce(
    (acc, match) => {
      if (!acc[match.roundNumber]) {
        acc[match.roundNumber] = [];
      }
      acc[match.roundNumber].push(match);
      return acc;
    },
    {} as Record<number, MatchExplanation[]>,
  );
  const sortedRounds = Object.keys(grouped)
    .map(Number)
    .sort((a, b) => a - b);
  return { grouped, sortedRounds };
}
