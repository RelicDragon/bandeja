const timeouts = new Map<string, NodeJS.Timeout>();

export const matchTimerCoordinator = {
  cancel(matchId: string) {
    const t = timeouts.get(matchId);
    if (t) {
      clearTimeout(t);
      timeouts.delete(matchId);
    }
  },

  schedule(matchId: string, delayMs: number, onFire: () => void | Promise<void>) {
    matchTimerCoordinator.cancel(matchId);
    if (!Number.isFinite(delayMs) || delayMs <= 0) {
      void Promise.resolve(onFire()).catch((e) => console.error('[MatchTimer] immediate job', e));
      return;
    }
    const id = setTimeout(() => {
      timeouts.delete(matchId);
      void Promise.resolve(onFire()).catch((e) => console.error('[MatchTimer] scheduled job', e));
    }, Math.min(delayMs, 2147483647));
    timeouts.set(matchId, id);
  },

  async cancelAllForGame(gameId: string, getMatchIds: () => Promise<string[]>) {
    const ids = await getMatchIds();
    for (const id of ids) matchTimerCoordinator.cancel(id);
  },
};
