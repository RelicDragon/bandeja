import assert from 'node:assert/strict';
import {
  resolveGameTextEditorLocaleStatus,
  type GameTextEditorFieldStatusInput,
} from './gameTextEditor.status';

function field(
  patch: Partial<GameTextEditorFieldStatusInput> = {},
): GameTextEditorFieldStatusInput {
  return {
    hasOriginal: true,
    preserveAsOriginal: false,
    generationState: 'ready',
    hasActiveCorrection: false,
    needsReview: false,
    jobInFlight: false,
    ...patch,
  };
}

function run() {
  assert.equal(
    resolveGameTextEditorLocaleStatus({
      name: field(),
      description: field(),
    }),
    'ready',
  );

  assert.equal(
    resolveGameTextEditorLocaleStatus({
      name: field({ hasActiveCorrection: true }),
      description: field(),
    }),
    'edited',
  );

  assert.equal(
    resolveGameTextEditorLocaleStatus({
      name: field({ generationState: 'pending', jobInFlight: true }),
      description: field(),
    }),
    'updating',
  );

  // Stuck pending row, job terminally failed → Retry, not Updating forever
  assert.equal(
    resolveGameTextEditorLocaleStatus({
      name: field({ generationState: 'pending', jobInFlight: false }),
      description: field(),
    }),
    'retry',
  );

  assert.equal(
    resolveGameTextEditorLocaleStatus({
      name: field({ jobInFlight: true, generationState: 'ready' }),
      description: field(),
    }),
    'updating',
  );

  assert.equal(
    resolveGameTextEditorLocaleStatus({
      name: field({ generationState: 'failed' }),
      description: field(),
    }),
    'retry',
  );

  assert.equal(
    resolveGameTextEditorLocaleStatus({
      name: field({ needsReview: true }),
      description: field({ hasActiveCorrection: true }),
    }),
    'needs_review',
  );

  assert.equal(
    resolveGameTextEditorLocaleStatus({
      name: field({ preserveAsOriginal: true }),
      description: field({ hasOriginal: false }),
    }),
    'not_needed',
  );

  assert.equal(
    resolveGameTextEditorLocaleStatus({
      name: field({ preserveAsOriginal: true }),
      description: field({ generationState: 'pending', jobInFlight: true }),
    }),
    'updating',
  );

  assert.equal(
    resolveGameTextEditorLocaleStatus({
      name: field({ generationState: null }),
      description: field({ hasOriginal: false }),
    }),
    'ready',
  );

  console.log('gameTextEditor.status.test.ts: ok');
}

run();
