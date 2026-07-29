import assert from 'node:assert/strict';
import { deliveryCollapseKey } from './deliveryCollapseKey';

assert.equal(deliveryCollapseKey(undefined), undefined);

const first = deliveryCollapseKey('FOLLOWED_USER_PLAY_INTENT:intent-1');
const second = deliveryCollapseKey('FOLLOWED_USER_PLAY_INTENT:intent-1');
const different = deliveryCollapseKey('FOLLOWED_USER_PLAY_INTENT:intent-2');

assert.equal(first, second);
assert.notEqual(first, different);
assert.equal(first?.length, 64);
