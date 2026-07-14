import assert from 'node:assert/strict';
import {
  isAvailableCardFormat,
  resolveAvailableEnrich,
} from './availableGamesProtocol';

assert.equal(isAvailableCardFormat('card'), true);
assert.equal(isAvailableCardFormat('CARD'), true);
assert.equal(isAvailableCardFormat(undefined), false);
assert.equal(isAvailableCardFormat('slim'), false);

// New FE (format=card): enrich off unless explicit
assert.equal(resolveAvailableEnrich({ format: 'card' }), false);
assert.equal(resolveAvailableEnrich({ format: 'card', enrich: 'true' }), true);
assert.equal(resolveAvailableEnrich({ format: 'card', enrich: '1' }), true);
assert.equal(resolveAvailableEnrich({ format: 'card', enrich: 'false' }), false);
assert.equal(resolveAvailableEnrich({ format: 'card', enrich: '0' }), false);

// Legacy FE (no format): enrich on unless explicit off
assert.equal(resolveAvailableEnrich({}), true);
assert.equal(resolveAvailableEnrich({ enrich: undefined }), true);
assert.equal(resolveAvailableEnrich({ enrich: 'false' }), false);
assert.equal(resolveAvailableEnrich({ enrich: '0' }), false);
assert.equal(resolveAvailableEnrich({ enrich: 'true' }), true);

console.log('availableGamesProtocol.test.ts: ok');
