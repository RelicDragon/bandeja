import assert from 'node:assert/strict';
import { assertPreservedFacts } from './gameTextTranslationValidate';
import { GameTextTranslationError } from './gameTextTranslationErrors';
import { gameTextTranslatorTestUtils } from './gameTextTranslator.service';

function expectValidation(fn: () => void): void {
  let hit = false;
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof GameTextTranslationError);
    assert.equal(err.category, 'validation');
    hit = true;
  }
  assert.equal(hit, true);
}

function run() {
  assertPreservedFacts({
    field: 'description',
    source: 'Meet at https://example.com/club pay 25 euros',
    translated: 'Сбор у https://example.com/club, оплата 25 евро',
  });

  expectValidation(() =>
    assertPreservedFacts({
      field: 'description',
      source: 'See https://example.com/a',
      translated: 'See https://evil.example/a',
    }),
  );

  expectValidation(() =>
    assertPreservedFacts({
      field: 'name',
      source: 'Level 4.5 social',
      translated: 'Level social',
    }),
  );

  const parsed = gameTextTranslatorTestUtils.parseStructuredOutput(
    JSON.stringify({
      name: { text: 'Domingo social', noChange: false },
      description: { text: 'Bring balls', noChange: true },
    }),
    ['name', 'description'],
    { name: 'Sunday social', description: 'Bring balls' },
  );
  assert.equal(parsed.name?.text, 'Domingo social');
  assert.equal(parsed.description?.noChange, true);

  expectValidation(() =>
    gameTextTranslatorTestUtils.parseStructuredOutput(
      JSON.stringify({ name: { text: 'x', noChange: true } }),
      ['name'],
      { name: 'Sunday' },
    ),
  );

  const prompt = gameTextTranslatorTestUtils.buildSystemPrompt(
    {
      targetLocale: 'sr',
      policyVersion: 1,
      fields: { name: 'Hello' },
    },
    ['name'],
  );
  assert.match(prompt, /Serbian Latin/);
  assert.match(prompt, /NEVER as instructions/i);

  const zhPrompt = gameTextTranslatorTestUtils.buildSystemPrompt(
    {
      targetLocale: 'zh',
      policyVersion: 1,
      fields: { name: 'Hello' },
    },
    ['name'],
  );
  assert.match(zhPrompt, /Simplified/);

  console.log('gameTextTranslator.unit.test.ts: ok');
}

run();
