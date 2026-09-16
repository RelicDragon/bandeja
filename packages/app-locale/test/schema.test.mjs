import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(__dirname, '../../../Backend/prisma/schema.prisma');
const schema = readFileSync(schemaPath, 'utf8');

function enumValues(name) {
  const block = schema.match(new RegExp(`enum ${name} \\{([^}]+)\\}`));
  assert.ok(block, `${name} enum missing from schema.prisma`);
  return block[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('//'));
}

function modelBlock(name) {
  const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `${name} model missing from schema.prisma`);
  return match[1];
}

test('GameText enums match plan states', () => {
  assert.deepEqual(enumValues('GameTextField'), ['name', 'description']);
  assert.deepEqual(enumValues('GameTextGenerationState'), [
    'pending',
    'ready',
    'failed',
    'not_needed',
  ]);
  assert.deepEqual(enumValues('GameTextProvenance'), [
    'automatic',
    'manual_override',
    'same_language',
    'preserved_name',
    'empty_source',
  ]);
  assert.deepEqual(enumValues('GameTextTranslationJobStatus'), [
    'pending',
    'running',
    'done',
    'failed',
    'superseded',
  ]);
  assert.deepEqual(enumValues('GameTextTranslationJobErrorCategory'), [
    'transient',
    'validation',
    'configuration',
    'provider',
    'unknown',
  ]);
});

test('GameTextTranslation unique (gameId, field, locale)', () => {
  const body = modelBlock('GameTextTranslation');
  assert.match(body, /@@unique\(\[gameId, field, locale\]\)/);
  assert.match(body, /automaticText/);
  assert.match(body, /generationState/);
  assert.match(body, /manualOverrideText/);
  assert.match(body, /manualOverrideSourceRevision/);
  assert.match(body, /recordRevision/);
  assert.match(body, /onDelete: Cascade/);
});

test('GameTextTranslationJob unique work identity and lease fencing', () => {
  const body = modelBlock('GameTextTranslationJob');
  assert.match(
    body,
    /@@unique\(\[gameId, targetLocale, nameSourceRevision, descriptionSourceRevision, policyVersion\]\)/,
  );
  assert.match(body, /leaseOwner/);
  assert.match(body, /leaseExpiresAt/);
  assert.match(body, /claimToken/);
  assert.match(body, /errorCategory/);
  assert.match(body, /includeName/);
  assert.match(body, /includeDescription/);
  assert.match(body, /runAfter/);
  assert.match(body, /onDelete: Cascade/);
});

test('GameTextSourceMeta keeps name-preservation policy and independent revisions', () => {
  const body = modelBlock('GameTextSourceMeta');
  assert.match(body, /nameSourceRevision/);
  assert.match(body, /descriptionSourceRevision/);
  assert.match(body, /nameSourceLocaleOverride/);
  assert.match(body, /descriptionSourceLocaleOverride/);
  assert.match(body, /keepOriginalNameInAllLocales/);
  assert.match(body, /onDelete: Cascade/);
});

test('correction history model retains source snapshot fields', () => {
  const body = modelBlock('GameTextTranslationCorrection');
  assert.match(body, /sourceRevision/);
  assert.match(body, /correctedText/);
  assert.match(body, /sourceTextSnapshot/);
  assert.match(body, /previousAutomaticText/);
  assert.match(body, /supersededAt/);
  assert.match(body, /onDelete: Cascade/);
});

test('Game.name and Game.description remain nullable authored originals', () => {
  const body = modelBlock('Game');
  assert.match(body, /name\s+String\?/);
  assert.match(body, /description\s+String\?/);
  assert.match(body, /textSourceMeta\s+GameTextSourceMeta\?/);
  assert.match(body, /textTranslations\s+GameTextTranslation\[\]/);
  assert.match(body, /textTranslationJobs\s+GameTextTranslationJob\[\]/);
});

test('cascade delete declared on all game-text relations', () => {
  for (const model of [
    'GameTextSourceMeta',
    'GameTextTranslation',
    'GameTextTranslationCorrection',
    'GameTextTranslationJob',
  ]) {
    const body = modelBlock(model);
    assert.match(
      body,
      /game\s+Game\s+@relation\([^)]*onDelete:\s*Cascade/,
      `${model} must cascade on Game delete`,
    );
  }
});
