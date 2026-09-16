import assert from 'node:assert/strict';
import {
  planGameTextSourceChange,
  GAME_TEXT_TRANSLATION_JOB_DEBOUNCE_MS,
} from './gameTextSourceChange.policy';
import {
  authoredGameTextEquals,
  normalizeAuthoredGameText,
} from './gameTextAuthoredText';

function plan(partial: Parameters<typeof planGameTextSourceChange>[0]) {
  return planGameTextSourceChange(partial);
}

function base(overrides: Partial<Parameters<typeof planGameTextSourceChange>[0]> = {}) {
  return plan({
    previousName: 'Sunday social',
    previousDescription: 'Bring balls',
    nameInPatch: false,
    descriptionInPatch: false,
    previousNameSourceRevision: 1,
    previousDescriptionSourceRevision: 1,
    keepOriginalNameInAllLocales: false,
    enqueueJobs: true,
    locales: ['en', 'ru'],
    ...overrides,
  });
}

function run() {
  assert.equal(normalizeAuthoredGameText('  '), null);
  assert.equal(normalizeAuthoredGameText(' hi '), 'hi');
  assert.equal(authoredGameTextEquals('a', 'a '), true);
  assert.equal(authoredGameTextEquals('a', 'b'), false);
  assert.equal(GAME_TEXT_TRANSLATION_JOB_DEBOUNCE_MS, 2000);

  const unchanged = base({
    nameInPatch: true,
    nextName: 'Sunday social',
    descriptionInPatch: true,
    nextDescription: 'Bring balls',
  });
  assert.equal(unchanged.nameChanged, false);
  assert.equal(unchanged.descriptionChanged, false);
  assert.equal(unchanged.shouldUpsertMeta, false);
  assert.equal(unchanged.shouldEnqueueJobs, false);

  const schedulingOnly = base();
  assert.equal(schedulingOnly.shouldUpsertMeta, false);
  assert.equal(schedulingOnly.shouldEnqueueJobs, false);

  const nameOnly = base({
    nameInPatch: true,
    nextName: 'Monday open',
  });
  assert.equal(nameOnly.nameChanged, true);
  assert.equal(nameOnly.descriptionChanged, false);
  assert.equal(nameOnly.nameSourceRevision, 2);
  assert.equal(nameOnly.descriptionSourceRevision, 1);
  assert.equal(nameOnly.includeName, true);
  assert.equal(nameOnly.includeDescription, false);
  assert.equal(nameOnly.shouldEnqueueJobs, true);

  const descriptionOnly = base({
    descriptionInPatch: true,
    nextDescription: 'New desc',
  });
  assert.equal(descriptionOnly.includeName, false);
  assert.equal(descriptionOnly.includeDescription, true);
  assert.equal(descriptionOnly.descriptionSourceRevision, 2);

  const clearName = base({
    nameInPatch: true,
    nextName: null,
  });
  assert.equal(clearName.nameCleared, true);
  assert.equal(clearName.includeName, false);
  assert.equal(clearName.shouldEnqueueJobs, false);
  assert.equal(clearName.nameSourceRevision, 2);

  const clearNameKeepDescWork = base({
    nameInPatch: true,
    nextName: '  ',
    descriptionInPatch: true,
    nextDescription: 'Still translating this',
  });
  assert.equal(clearNameKeepDescWork.nameCleared, true);
  assert.equal(clearNameKeepDescWork.includeName, false);
  assert.equal(clearNameKeepDescWork.includeDescription, true);

  const preservedName = base({
    nameInPatch: true,
    nextName: 'Brand Cup',
    keepOriginalNameInAllLocales: true,
  });
  assert.equal(preservedName.nameChanged, true);
  assert.equal(preservedName.includeName, false);
  assert.equal(preservedName.shouldEnqueueJobs, false);

  const createBoth = plan({
    previousName: null,
    previousDescription: null,
    nameInPatch: true,
    nextName: 'New game',
    descriptionInPatch: true,
    nextDescription: 'Hello',
    previousNameSourceRevision: 0,
    previousDescriptionSourceRevision: 0,
    keepOriginalNameInAllLocales: false,
    enqueueJobs: true,
    locales: ['en'],
  });
  assert.equal(createBoth.nameSourceRevision, 1);
  assert.equal(createBoth.descriptionSourceRevision, 1);
  assert.equal(createBoth.includeName, true);
  assert.equal(createBoth.includeDescription, true);

  const flagOff = base({
    nameInPatch: true,
    nextName: 'Changed',
    enqueueJobs: false,
  });
  assert.equal(flagOff.shouldUpsertMeta, true);
  assert.equal(flagOff.shouldEnqueueJobs, false);
  assert.equal(flagOff.shouldWakeWorker, false);

  console.log('gameTextSourceChange.policy.test.ts: ok');
}

run();
