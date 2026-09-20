import {
  compareVersionStrings,
  hydrateVersionsFromStores,
  mergeStoreVersionFloor,
  parseStoreVersionOutput,
  proposeNextFromStoreVersions,
  storeHoldsPlannedRelease,
  validatePlannedAgainstStores,
} from './app-release-store-version';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

assert(compareVersionStrings('0.97.35', '0.97.34') > 0, 'compareVersionStrings higher patch');
assert(compareVersionStrings('0.97.35', '0.97.35') === 0, 'compareVersionStrings equal');
assert(compareVersionStrings('0.96.99', '0.97.1') < 0, 'compareVersionStrings minor');

const floor = mergeStoreVersionFloor([
  { version: '0.97.34', build: 220 },
  { version: '0.97.35', build: 217 },
]);
assert(floor.version === '0.97.35' && floor.build === 220, 'mergeStoreVersionFloor takes max of each');

const planned = proposeNextFromStoreVersions([
  { version: '0.97.34', build: 220 },
  { version: '0.97.35', build: 217 },
]);
assert(planned.version === '0.97.36' && planned.build === 221, 'proposeNextFromStoreVersions bumps floor');

assert(
  validatePlannedAgainstStores(
    { version: '0.97.36', build: 221 },
    { android: { version: '0.97.35', build: 217 }, ios: { version: '0.97.34', build: 220 } },
    'both',
  ) === null,
  'validatePlannedAgainstStores accepts higher build',
);

assert(
  validatePlannedAgainstStores(
    { version: '0.97.35', build: 217 },
    { android: { version: '0.97.35', build: 217 } },
    'android',
  ) !== null,
  'validatePlannedAgainstStores rejects equal android build',
);

assert(
  validatePlannedAgainstStores(
    { version: '0.97.33', build: 300 },
    { ios: { version: '0.97.34', build: 220 } },
    'ios',
  ) !== null,
  'validatePlannedAgainstStores rejects lower version',
);

// A resumed session whose own binaries are already on the stores must not be told to
// start over — equality with the planned build is the expected state, not a collision.
assert(
  validatePlannedAgainstStores(
    { version: '0.97.49', build: 231 },
    { android: { version: '0.97.49', build: 231 }, ios: { version: '0.97.49', build: 231 } },
    'both',
    { android: true, ios: true },
  ) === null,
  'validatePlannedAgainstStores accepts our own already-uploaded build on resume',
);

assert(
  validatePlannedAgainstStores(
    { version: '0.97.49', build: 231 },
    { android: { version: '0.97.49', build: 231 }, ios: { version: '0.97.49', build: 231 } },
    'both',
    { android: true },
  ) !== null,
  'validatePlannedAgainstStores still rejects a platform we did not upload',
);

assert(
  validatePlannedAgainstStores(
    { version: '0.97.49', build: 231 },
    { android: { version: '0.97.50', build: 232 } },
    'android',
    { android: true },
  ) !== null,
  'validatePlannedAgainstStores still rejects a store build newer than planned',
);

assert(
  storeHoldsPlannedRelease({ version: '0.97.49', build: 231 }, { version: '0.97.49', build: 231 }),
  'storeHoldsPlannedRelease matches an exact version and build',
);

assert(
  !storeHoldsPlannedRelease({ version: '0.97.48', build: 231 }, { version: '0.97.49', build: 231 }),
  'storeHoldsPlannedRelease rejects a build collision under a different version',
);

assert(
  !storeHoldsPlannedRelease(undefined, { version: '0.97.49', build: 231 }),
  'storeHoldsPlannedRelease rejects a missing store version',
);

const parsed = parseStoreVersionOutput(
  'INFO APP_RELEASE_STORE_VERSION_JSON:{"platform":"android","version":"0.97.35","build":217}',
  'android',
);
assert(parsed.version === '0.97.35' && parsed.build === 217, 'parseStoreVersionOutput android');

const hydrated = hydrateVersionsFromStores(
  {
    android: { version: '0.97.35', build: 217 },
    ios: { version: '0.97.35', build: 217 },
  },
  'both',
);
assert(
  hydrated.current.version === '0.97.35' &&
    hydrated.current.build === 217 &&
    hydrated.planned.version === '0.97.36' &&
    hydrated.planned.build === 218,
  'hydrateVersionsFromStores proposes next from stores',
);

console.log('app-release-store-version tests: OK');
