import assert from 'node:assert/strict';
import { PlayIntentDrainCoordinator } from './playIntentDrainCoordinator';

void (async () => {
  const coordinator = new PlayIntentDrainCoordinator();
  let releaseFirstPass: (() => void) | undefined;
  let passes = 0;
  const pass = async () => {
    passes += 1;
    if (passes === 1) {
      await new Promise<void>((resolve) => {
        releaseFirstPass = resolve;
      });
    }
  };

  const first = coordinator.run(pass);
  await Promise.resolve();
  const concurrent = coordinator.run(pass);
  releaseFirstPass?.();
  await Promise.all([first, concurrent]);
  assert.equal(passes, 2, 'a concurrent request must trigger another pass');

  await coordinator.run(pass);
  assert.equal(passes, 3, 'a completed drain must allow a fresh pass');
  console.log('playIntentDrainCoordinator.test.ts: ok');
})();
