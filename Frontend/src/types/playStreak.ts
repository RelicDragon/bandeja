export type PlayStreakView = {
  current: number;
  best: number;
  lastPlayAt: string | null;
  deadlineAt: string | null;
  atRisk: boolean;
  hoursLeft: number | null;
};

export function emptyPlayStreak(): PlayStreakView {
  return {
    current: 0,
    best: 0,
    lastPlayAt: null,
    deadlineAt: null,
    atRisk: false,
    hoursLeft: null,
  };
}
