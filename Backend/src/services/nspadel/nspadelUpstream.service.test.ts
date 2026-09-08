import assert from 'assert';
import { isAllowedNspadelUpstreamPath } from './nspadelUpstream.service';

assert.strictEqual(isAllowedNspadelUpstreamPath('/rest/v1/courts'), true);
assert.strictEqual(
  isAllowedNspadelUpstreamPath('/rest/v1/courts?select=id%2Cname'),
  true,
);
assert.strictEqual(isAllowedNspadelUpstreamPath('/rest/v1/rpc/get_availability'), true);
assert.strictEqual(
  isAllowedNspadelUpstreamPath('/rest/v1/rpc/get_availability?date=2026-09-08'),
  true,
);
assert.strictEqual(isAllowedNspadelUpstreamPath('/auth/v1/token?grant_type=password'), false);
assert.strictEqual(isAllowedNspadelUpstreamPath('/storage/v1/object/public/logo.png'), false);
assert.strictEqual(isAllowedNspadelUpstreamPath('/rest/v1/'), false);
assert.strictEqual(isAllowedNspadelUpstreamPath('/rest/v1/rpc/'), false);
assert.strictEqual(isAllowedNspadelUpstreamPath('/rest/v1/courts/../auth'), false);
assert.strictEqual(isAllowedNspadelUpstreamPath('/rest/v1/courts/extra'), false);
assert.strictEqual(isAllowedNspadelUpstreamPath('/rest/v1/courts-extra'), false);
assert.strictEqual(isAllowedNspadelUpstreamPath('/evil'), false);

console.log('nspadelUpstream.service.test.ts: all passed');
