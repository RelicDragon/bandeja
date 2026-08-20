export type BugCreateSubmitSession = {
  begin: () => number | null;
  isCurrent: (generation: number) => boolean;
  finish: (generation: number) => void;
  invalidate: () => void;
};

export function createBugCreateSubmitSession(): BugCreateSubmitSession {
  let generation = 0;
  let inFlight = false;

  return {
    begin() {
      if (inFlight) return null;
      inFlight = true;
      generation += 1;
      return generation;
    },
    isCurrent(nextGeneration) {
      return nextGeneration === generation;
    },
    finish(nextGeneration) {
      if (nextGeneration === generation) inFlight = false;
    },
    invalidate() {
      generation += 1;
      inFlight = false;
    },
  };
}
