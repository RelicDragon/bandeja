import assert from 'node:assert/strict';
import {
  GiphyImportBusyError,
  withGiphyImportSlot,
} from './giphyImportConcurrency';

async function main(): Promise<void> {
  const releases: Array<() => void> = [];
  const active = Array.from({ length: 3 }, () =>
    withGiphyImportSlot(
      () =>
        new Promise<void>((resolve) => {
          releases.push(resolve);
        })
    )
  );
  await new Promise((resolve) => setTimeout(resolve, 0));

  let queuedWorkStarted = false;
  await assert.rejects(
    () =>
      withGiphyImportSlot(async () => {
        queuedWorkStarted = true;
      }, 15),
    (error: unknown) => error instanceof GiphyImportBusyError
  );
  assert.equal(queuedWorkStarted, false);

  for (const release of releases) release();
  await Promise.all(active);
  console.log('giphyImportConcurrency.test.ts: ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
