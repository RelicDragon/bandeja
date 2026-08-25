export type RestoreRafLoop = {
  arm: () => void;
  stop: () => void;
};

export function createRestoreRafLoop(opts: {
  restore: () => void;
  shouldContinue: () => boolean;
  requestAnimationFrame?: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame?: (handle: number) => void;
}): RestoreRafLoop {
  const raf = opts.requestAnimationFrame ?? ((cb) => requestAnimationFrame(cb));
  const caf = opts.cancelAnimationFrame ?? ((id) => cancelAnimationFrame(id));
  let frameId = 0;
  let generation = 0;
  let stopped = false;

  const tick = () => {
    const gen = generation;
    frameId = 0;
    opts.restore();
    if (stopped || gen !== generation) return;
    if (!opts.shouldContinue()) return;
    frameId = raf(tick);
  };

  return {
    arm() {
      if (stopped) return;
      if (frameId) caf(frameId);
      frameId = raf(tick);
    },
    stop() {
      stopped = true;
      generation += 1;
      if (frameId) caf(frameId);
      frameId = 0;
    },
  };
}
