import {
  iosDistributesExternally,
  iosDistributionLabel,
  iosIsTestFlightOnly,
  iosSubmitsForReview,
  iosTouchesAppStoreVersion,
  parseTestFlightGroups,
  resolveIosDistribution,
  shouldUpdateShippedBaseline,
} from './app-release-ios-distribution';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

assert(resolveIosDistribution('internal') === 'testflight', 'internal alias maps to TestFlight');
assert(resolveIosDistribution('external') === 'beta', 'external alias maps to beta');
assert(resolveIosDistribution('upload') === 'prepare', 'upload alias maps to prepare');
assert(resolveIosDistribution('review') === 'submit', 'review alias maps to submit');
assert(resolveIosDistribution('bogus') === null, 'unknown iOS destination is rejected');

assert(iosIsTestFlightOnly('testflight'), 'TestFlight Internal is TestFlight-only');
assert(iosIsTestFlightOnly('beta'), 'TestFlight Beta is TestFlight-only');
assert(!iosIsTestFlightOnly('prepare'), 'prepare is not TestFlight-only');
assert(!iosTouchesAppStoreVersion('testflight'), 'TestFlight Internal does not touch App Store version');
assert(!iosTouchesAppStoreVersion('beta'), 'TestFlight Beta does not touch App Store version');
assert(iosTouchesAppStoreVersion('prepare'), 'prepare attaches an App Store version');
assert(iosTouchesAppStoreVersion('submit'), 'submit attaches an App Store version');
assert(!iosSubmitsForReview('testflight'), 'TestFlight Internal does not submit for App Review');
assert(!iosSubmitsForReview('beta'), 'TestFlight Beta does not submit for App Review');
assert(iosSubmitsForReview('submit'), 'submit sends the build to App Review');
assert(iosDistributesExternally('beta'), 'beta distributes to external TestFlight groups');
assert(!iosDistributesExternally('testflight'), 'internal TestFlight does not distribute externally');

assert(
  parseTestFlightGroups(' Friends, Family , ').join(',') === 'Friends,Family',
  'parses comma-separated TestFlight groups',
);
assert(
  iosDistributionLabel('testflight').includes('does not touch App Store version'),
  'TestFlight Internal label promises not to touch App Review',
);
assert(
  iosDistributionLabel('beta', ['QA']).includes('QA'),
  'TestFlight Beta label includes group names',
);

assert(
  shouldUpdateShippedBaseline('ios', { iosDistribution: 'testflight' }) === false,
  'iOS-only TestFlight does not move the shipped baseline',
);
assert(
  shouldUpdateShippedBaseline('ios', { iosDistribution: 'beta' }) === false,
  'iOS-only TestFlight Beta does not move the shipped baseline',
);
assert(
  shouldUpdateShippedBaseline('ios', { iosDistribution: 'submit' }) === true,
  'iOS App Review uploads still update the shipped baseline',
);
assert(
  shouldUpdateShippedBaseline('both', {
    androidTrack: 'internal',
    iosDistribution: 'testflight',
  }) === false,
  'Android internal + TestFlight does not move the shipped baseline',
);
assert(
  shouldUpdateShippedBaseline('both', {
    androidTrack: 'production',
    iosDistribution: 'testflight',
  }) === true,
  'Android production + TestFlight still updates the shipped baseline',
);
assert(
  shouldUpdateShippedBaseline('android', { androidTrack: 'internal' }) === true,
  'Android-only internal keeps the previous baseline behavior',
);

console.log('app-release-ios-distribution tests: OK');
