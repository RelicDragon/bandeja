import assert from 'assert';
import {
  canonicalizeForCompare,
  isNoTranslationNeededMarker,
  NO_TRANSLATION_NEEDED_MARKER,
  normalizeTranslationOutput,
  translationEqualsSource,
} from './translationOutputNormalize';
import { diceCoefficient, translationIsRedundantOfSource } from './translationRedundant';

function testMarkerExact() {
  assert.equal(isNoTranslationNeededMarker(NO_TRANSLATION_NEEDED_MARKER), true);
  assert.equal(isNoTranslationNeededMarker(`  ${NO_TRANSLATION_NEEDED_MARKER}  `), true);
  assert.equal(isNoTranslationNeededMarker(`"${NO_TRANSLATION_NEEDED_MARKER}"`), true);
  assert.equal(isNoTranslationNeededMarker(`\`\`\`\n${NO_TRANSLATION_NEEDED_MARKER}\n\`\`\``), true);
  assert.equal(isNoTranslationNeededMarker('[[no_translation_needed]]'), true);
  assert.equal(isNoTranslationNeededMarker('NO_TRANSLATION_NEEDED'), true);
  assert.equal(isNoTranslationNeededMarker('No translation needed'), true);
  assert.equal(isNoTranslationNeededMarker('[NO TRANSLATION NEEDED]'), true);
  assert.equal(isNoTranslationNeededMarker('hello'), false);
  assert.equal(isNoTranslationNeededMarker(`${NO_TRANSLATION_NEEDED_MARKER} extra`), false);
  assert.equal(isNoTranslationNeededMarker('NO_TRANSLATION_NEEDED please'), false);
  console.log('ok isNoTranslationNeededMarker');
}

function testEqualsSource() {
  assert.equal(translationEqualsSource('привет', 'привет'), true);
  assert.equal(translationEqualsSource('привет  мир', 'привет мир'), true);
  assert.equal(translationEqualsSource('привет', 'Привет'), false);
  assert.equal(translationEqualsSource('a', NO_TRANSLATION_NEEDED_MARKER), false);
  assert.equal(canonicalizeForCompare('a\u200Bb'), 'ab');
  console.log('ok translationEqualsSource / canonicalize');
}

function testRedundant() {
  const ru = 'Сегодня вечером играем в падел, не опаздывайте пожалуйста';
  const ruPolish = 'Сегодня вечером играем в падел, не опаздывайте, пожалуйста';
  assert.equal(translationIsRedundantOfSource(ru, ru), true);
  assert.equal(translationIsRedundantOfSource(ru, ruPolish, 'ru'), true);
  assert.equal(diceCoefficient(canonicalizeForCompare(ru), canonicalizeForCompare(ruPolish)) > 0.9, true);

  const en = 'We play padel tonight, please do not be late';
  const es = 'Jugamos al pádel esta noche, por favor no lleguen tarde';
  assert.equal(translationIsRedundantOfSource(en, es, 'es'), false);

  assert.equal(translationIsRedundantOfSource('ok', 'okay'), false);
  console.log('ok translationIsRedundantOfSource');
}

function testNormalize() {
  assert.equal(normalizeTranslationOutput(`«${NO_TRANSLATION_NEEDED_MARKER}»`), NO_TRANSLATION_NEEDED_MARKER);
  console.log('ok normalizeTranslationOutput marker');
}

testMarkerExact();
testEqualsSource();
testRedundant();
testNormalize();
console.log('all translation harden tests passed');
