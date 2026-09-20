import assert from 'assert';
import { sourcePassthroughIsPlausible } from './translationFrancCheck';
import { translationIsRedundantOfSource } from './translationRedundant';

/**
 * Guard against the "translation identical to source" class of bug.
 *
 * DeepSeek Flash answers [[NO_TRANSLATION_NEEDED]] for plainly cross-language
 * pairs (18% of prod calls). TranslationService used to trust that marker
 * unconditionally and return the source, which the rating-explanation store then
 * cached as a finished translation. Switching model name is not a mitigation:
 * `deepseek-chat` and `deepseek-v4-flash` are legacy aliases that now resolve to
 * the same Flash model. These tests pin the predicate that has to agree before a
 * passthrough is accepted.
 */

/** Verbatim prod source that was served as a Russian "translation". */
const EN_RATING_EXPLANATION = `Your level moved from 1.3958 to 1.4137, a net gain of +0.0180 across eleven matches. That is a fair and correctly sized outcome: you went 5–6 against an average opponent level of roughly 1.80, meaning you were usually the underdog on paper, and the small positive net reflects that you outperformed expectations often enough to offset the losses without any single result swinging your rating disproportionately.

The main reason the move is modest rather than dramatic is the reliability damping. Your rating is still settling, so each match's raw level change is scaled down substantially before it is applied.`;

const RU_RATING_EXPLANATION = `Ваш уровень вырос с 1.3958 до 1.4137, чистый прирост +0.0180 за одиннадцать матчей. Это справедливый и корректный по величине результат: вы сыграли 5–6 против среднего уровня соперника около 1.80, то есть на бумаге вы чаще были аутсайдером.

Основная причина скромного изменения — демпфирование по надёжности. Ваш рейтинг ещё стабилизируется, поэтому сырое изменение уровня заметно уменьшается перед применением.`;

const ES_RATING_EXPLANATION = `Tu nivel pasó de 1,3958 a 1,4137, una ganancia neta de +0,0180 en once partidos. Es un resultado justo y de magnitud correcta: tuviste un registro de 5–6 contra un nivel medio de rival de aproximadamente 1,80, lo que significa que en el papel solías ser el menos favorito.

La razón principal de que el movimiento sea modesto es la amortiguación por fiabilidad. Tu valoración aún se está asentando.`;

async function testMarkerRejectedForCrossLanguageSource() {
  // The production failure: English source, Russian target, model said "no
  // translation needed". The guard must refuse the passthrough. 'fr' and 'de'
  // are the cases franc alone gets wrong, so they are load-bearing here.
  for (const target of ['ru', 'es', 'sr', 'de', 'fr']) {
    assert.equal(
      await sourcePassthroughIsPlausible(EN_RATING_EXPLANATION, target),
      false,
      `expected English source to be rejected as a ${target} passthrough`
    );
  }
  console.log('ok cross-language passthrough rejected');
}

async function testMarkerHonouredWhenSourceReallyIsTarget() {
  // The marker exists to catch what the strict pre-check misses, so a source
  // genuinely in the target language must still be allowed through.
  assert.equal(await sourcePassthroughIsPlausible(EN_RATING_EXPLANATION, 'en'), true);
  assert.equal(await sourcePassthroughIsPlausible(RU_RATING_EXPLANATION, 'ru'), true);
  assert.equal(await sourcePassthroughIsPlausible(ES_RATING_EXPLANATION, 'es'), true);
  console.log('ok same-language passthrough honoured');
}

async function testShortSourceStaysPermissive() {
  // Chat messages are short, and that is where detection is least reliable and
  // the model's judgement is worth most. The guard must not bite there.
  for (const target of ['ru', 'es', 'fr']) {
    assert.equal(await sourcePassthroughIsPlausible('ok see you at 8', target), true);
    assert.equal(await sourcePassthroughIsPlausible('Padel tonight?', target), true);
  }
  console.log('ok short sources stay permissive');
}

async function testUnsupportedTargetKeepsPreviousBehaviour() {
  // No franc expectations configured for these targets: stay permissive rather
  // than failing every translation into them.
  for (const target of ['id', 'xx']) {
    assert.equal(await sourcePassthroughIsPlausible(EN_RATING_EXPLANATION, target), true);
  }
  console.log('ok unsupported targets stay permissive');
}

function testStorageGuardCatchesIdenticalText() {
  // Defence in depth in ratingExplanationLlmTranslate: identical text must never
  // be persisted as a translation, whatever the upstream reason.
  assert.equal(
    translationIsRedundantOfSource(EN_RATING_EXPLANATION, EN_RATING_EXPLANATION, 'ru'),
    true
  );
  assert.equal(
    translationIsRedundantOfSource(EN_RATING_EXPLANATION, RU_RATING_EXPLANATION, 'ru'),
    false
  );
  assert.equal(
    translationIsRedundantOfSource(EN_RATING_EXPLANATION, ES_RATING_EXPLANATION, 'es'),
    false
  );
  console.log('ok storage guard rejects source-as-translation');
}

async function main() {
  await testMarkerRejectedForCrossLanguageSource();
  await testMarkerHonouredWhenSourceReallyIsTarget();
  await testShortSourceStaysPermissive();
  await testUnsupportedTargetKeepsPreviousBehaviour();
  testStorageGuardCatchesIdenticalText();
  console.log('all translation passthrough guard tests passed');
}

void main();
