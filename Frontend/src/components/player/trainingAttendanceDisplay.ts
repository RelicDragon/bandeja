import type { Sport } from '@/types';

type StatsWithTraining = {
  sport?: Sport;
  trainingAttendanceCount?: number;
};

function finiteCount(value: number | null | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return value;
}

export function resolveDisplayedTrainingAttendance(args: {
  historySport: Sport;
  parentStats?: StatsWithTraining;
  sportStats?: StatsWithTraining;
}): number | undefined {
  const sportMatch =
    args.sportStats?.sport === args.historySport
      ? finiteCount(args.sportStats.trainingAttendanceCount)
      : undefined;
  if (sportMatch !== undefined) return sportMatch;

  const parentMatch =
    args.parentStats?.sport === args.historySport
      ? finiteCount(args.parentStats.trainingAttendanceCount)
      : undefined;
  if (parentMatch !== undefined) return parentMatch;

  return undefined;
}
