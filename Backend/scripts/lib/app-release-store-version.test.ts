import {
  compareVersionStrings,
  hydrateVersionsFromStores,
  mergeStoreVersionFloor,
  parseStoreVersionOutput,
  proposeNextFromStoreVersions,
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
