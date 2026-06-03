/**
 * Static parity checks for watch serve guide vs FE sport rules.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const watchRoot = join(__dirname, '../../../Frontend/ios/App/BandejaWatch Watch App');
const feRules = join(__dirname, '../../../Frontend/src/utils/liveScoring');

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function read(rel: string): string {
  return readFileSync(join(watchRoot, rel), 'utf8');
}

function main(): void {
  const engine = read('Services/ServeGuideEngine.swift');
  const rules = read('Services/ServeGuideSportRules.swift');
  assert(engine.includes('finalizeSnapshot'), 'tennis motion token finalize');
  assert(engine.includes('resolvedSport'), 'resolved sport on inputs');
  assert(!engine.includes('hiddenForMatch'), 'engine does not use hiddenForMatch');

  assert(rules.includes('squashChangeEnds'), 'squash PAR change ends');
  assert(rules.includes('pickleballChangeEnds'), 'pickleball interval change ends');
  assert(rules.includes('pickleballMidpointScore'), 'pickleball midpoint helper');

  const store = read('Services/WatchServeGuideSessionStore.swift');
  assert(store.includes('hiddenForMatch'), 'decode migrates legacy hiddenForMatch');
  assert(!store.includes('hiddenForMatch: false'), 'empty record without hiddenForMatch field');

  const fePb = readFileSync(join(feRules, 'pickleballServe.ts'), 'utf8');
  const feSq = readFileSync(join(feRules, 'squashServe.ts'), 'utf8');
  assert(fePb.includes('pickleballMidpointScore'), 'FE pickleball midpoint');
  assert(rules.includes('pickleballMidpointScore'), 'watch pickleball midpoint matches');
  assert(feSq.includes('max === 11 && min < 10'), 'FE squash change ends');
  assert(rules.includes('maxScore == 11 && minScore < 10'), 'watch squash change ends matches');
  assert(feSq.includes('squashCourtSideForServerScore'), 'FE squash court side');
  assert(rules.includes('squashCourtSide'), 'watch squash court side');

  console.log('watch-serve-guide-parity: all passed');
}

main();
