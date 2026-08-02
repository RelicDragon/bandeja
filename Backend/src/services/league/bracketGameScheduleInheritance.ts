export type BracketGameScheduleSource = {
  clubId: string | null;
  courtId: string | null;
  cityId: string;
  startTime: Date;
  endTime: Date;
  timeIsSet: boolean;
  gameCourts: Array<{ courtId: string; order: number }>;
};

export type InheritedBracketGameSchedule = BracketGameScheduleSource;

/** Copies a bracket slot's published time/location into its materialized game. */
export function inheritBracketGameSchedule(
  source: BracketGameScheduleSource | null,
): InheritedBracketGameSchedule | null {
  if (!source) return null;

  return {
    clubId: source.clubId,
    courtId: source.courtId,
    cityId: source.cityId,
    startTime: new Date(source.startTime),
    endTime: new Date(source.endTime),
    timeIsSet: source.timeIsSet,
    gameCourts: source.gameCourts
      .map(({ courtId, order }) => ({ courtId, order }))
      .sort((a, b) => a.order - b.order),
  };
}
