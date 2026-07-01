import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const {
  applyInboundMessageBump,
  clearOptimisticBumpForContext,
  computeContextCountWithBump,
  contextKey,
  noteReconciledInboundMessageIds,
  reconcileOptimisticBumpOnEnvelope,
} = require('../dist/index.js');

test('applyInboundMessageBump increments pending count and tracks message ids', () => {
  const key = contextKey('USER', 'u1');
  let bumps = applyInboundMessageBump({}, key, 'm1');
  assert.equal(bumps[key].pendingCount, 1);
  assert.deepEqual(bumps[key].messageIds, ['m1']);

  bumps = applyInboundMessageBump(bumps, key, 'm2');
  assert.equal(bumps[key].pendingCount, 2);
  assert.deepEqual(bumps[key].messageIds, ['m1', 'm2']);
});

test('applyInboundMessageBump dedupes same message id', () => {
  const key = contextKey('USER', 'u1');
  const once = applyInboundMessageBump({}, key, 'm1');
  const twice = applyInboundMessageBump(once, key, 'm1');
  assert.equal(twice[key].pendingCount, 1);
});

test('reconcileOptimisticBumpOnEnvelope clears pending bump', () => {
  const key = contextKey('USER', 'u1');
  const bumps = applyInboundMessageBump({}, key, 'm1');
  const cleared = reconcileOptimisticBumpOnEnvelope(bumps, key);
  assert.equal(cleared[key], undefined);
});

test('computeContextCountWithBump adds pending to base', () => {
  const key = contextKey('USER', 'u1');
  const bumps = applyInboundMessageBump({}, key, 'm1');
  assert.equal(computeContextCountWithBump(3, bumps[key]), 4);
  assert.equal(computeContextCountWithBump(3, undefined), 3);
});

test('noteReconciledInboundMessageIds caps set size', () => {
  const handled = noteReconciledInboundMessageIds(new Set(), ['a', 'b'], 2);
  assert.equal(handled.size, 2);
  const grown = noteReconciledInboundMessageIds(handled, ['c'], 2);
  assert.equal(grown.size, 2);
  assert.equal(grown.has('a'), false);
  assert.equal(grown.has('b'), true);
  assert.equal(grown.has('c'), true);
});

test('clearOptimisticBumpForContext is no-op when absent', () => {
  const key = contextKey('USER', 'u1');
  const bumps = {};
  assert.equal(clearOptimisticBumpForContext(bumps, key), bumps);
});
