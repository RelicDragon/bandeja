import assert from 'node:assert/strict';
import type { IAiService, CreateCompletionOptions } from '../ai/types';
import { FaqTranslationError, translateFaqPair, faqTranslatorTestUtils } from './faqTranslator.service';

function fakeAi(output: unknown): { ai: IAiService; calls: CreateCompletionOptions[] } {
  const calls: CreateCompletionOptions[] = [];
  return {
    calls,
    ai: {
      isConfigured: () => true,
      createCompletion: async (options) => {
        calls.push(options);
        return typeof output === 'string' ? output : JSON.stringify(output);
      },
    },
  };
}

async function rejectsValidation(action: () => Promise<unknown>): Promise<void> {
  await assert.rejects(action, (error: unknown) =>
    error instanceof FaqTranslationError && error.category === 'validation');
}

async function main(): Promise<void> {
  const source = {
    question: 'Can I join 2 sessions? https://example.com/2',
    answer: 'Yes, join 2 sessions.\nPay 10 EUR.',
    targetLocale: 'es',
    sourceLocaleOverride: null,
    userId: 'requester-1',
  };
  const translated = {
    question: '¿Puedo unirme a 2 sesiones? https://example.com/2',
    answer: 'Sí, únete a 2 sesiones.\nPaga 10 EUR.',
    noChange: false,
  };
  const success = fakeAi(translated);
  assert.deepEqual(await translateFaqPair(source, success.ai), translated);
  assert.equal(success.calls.length, 1);
  assert.equal(success.calls[0].reason, 'faq_translation');
  assert.equal(success.calls[0].userId, 'requester-1');
  assert.match(success.calls[0].messages[1].content, /"answer":"Yes, join/);
  assert.match(faqTranslatorTestUtils.systemPrompt('sr', null), /Serbian Latin/);
  assert.match(faqTranslatorTestUtils.systemPrompt('zh', null), /Chinese Simplified/);

  await rejectsValidation(() => translateFaqPair(source, fakeAi('not json').ai));
  await rejectsValidation(() => translateFaqPair(source, fakeAi({ question: 'Hola', noChange: false }).ai));
  await rejectsValidation(() => translateFaqPair(source, fakeAi({ ...translated, question: '¿Puedo unirme a 3 sesiones? https://example.com/2' }).ai));
  await rejectsValidation(() => translateFaqPair(source, fakeAi({ ...translated, answer: 'Sí, únete a 2 sesiones. Paga 10 EUR.' }).ai));
  await rejectsValidation(() => translateFaqPair({ ...source, sourceLocaleOverride: 'en' }, fakeAi({ question: source.question, answer: source.answer, noChange: true }).ai));
  await rejectsValidation(() => translateFaqPair(source, fakeAi({ ...source, noChange: false }).ai));

  const arabic = { ...source, targetLocale: 'ar' };
  await rejectsValidation(() => translateFaqPair(arabic, fakeAi({ ...source, noChange: true }).ai));
  await rejectsValidation(() => translateFaqPair(arabic, fakeAi({ ...translated, noChange: false }).ai));
  const serbian = { ...source, targetLocale: 'sr' };
  await rejectsValidation(() => translateFaqPair(serbian, fakeAi({ question: 'Могу ли да се придружим 2 сесије? https://example.com/2', answer: 'Да, придружи се 2 сесије.\nПлати 10 EUR.', noChange: false }).ai));
  const chinese = { ...source, targetLocale: 'zh' };
  await rejectsValidation(() => translateFaqPair(chinese, fakeAi({ question: '我可以參加 2 場嗎？ https://example.com/2', answer: '可以參加 2 場。\n支付 10 EUR。', noChange: false }).ai));

  const same = {
    ...source,
    question: 'Можно ли присоединиться к игре?',
    answer: 'Да, приходите на игру сегодня вечером.',
    targetLocale: 'ru',
    sourceLocaleOverride: null,
  };
  const unused = fakeAi({ question: same.question, answer: same.answer, noChange: true });
  assert.deepEqual(await translateFaqPair(same, unused.ai), {
    question: same.question, answer: same.answer, noChange: true,
  });
  assert.equal(unused.calls.length, 1);
  await rejectsValidation(() => translateFaqPair({ ...same, sourceLocaleOverride: 'ru' }, unused.ai));
  const shortEnglish = {
    question: 'Where should we meet?',
    answer: 'Meet by Court 2 at the main entrance.',
    targetLocale: 'en',
    sourceLocaleOverride: null,
  };
  const shortEnglishNoChange = { question: shortEnglish.question, answer: shortEnglish.answer, noChange: true };
  assert.deepEqual(await translateFaqPair(shortEnglish, fakeAi(shortEnglishNoChange).ai), shortEnglishNoChange);
  await rejectsValidation(() => translateFaqPair({ ...shortEnglish, targetLocale: 'es' }, fakeAi(shortEnglishNoChange).ai));
  const nameSource = { ...source, question: 'Wi-Fi?', targetLocale: 'ru' };
  const nameResult = {
    question: 'Wi-Fi?',
    answer: 'Да, присоединяйтесь к 2 сессиям.\nОплатите 10 EUR.',
    noChange: false,
  };
  assert.deepEqual(await translateFaqPair(nameSource, fakeAi(nameResult).ai), nameResult);
  await rejectsValidation(() => translateFaqPair({ ...source, question: 'Join?', sourceLocaleOverride: 'en' }, fakeAi({ question: 'Join?', answer: translated.answer, noChange: false }).ai));
  await rejectsValidation(() => translateFaqPair({ ...source, targetLocale: 'ru' }, fakeAi({
    question: 'Могу ли я присоединиться к 2 сессиям? https://example.com/2',
    answer: source.answer,
    noChange: false,
  }).ai));
  await rejectsValidation(() => translateFaqPair({ ...source, question: 'x'.repeat(5_001) }, unused.ai));
  await rejectsValidation(() => translateFaqPair({ ...source, targetLocale: 'xx' }, unused.ai));
  const indonesian = { question: 'Kapan saya bisa mendaftar untuk pertandingan ini?', answer: 'Anda bisa mendaftar sebelum pertandingan dimulai.', targetLocale: 'id', sourceLocaleOverride: null };
  assert.deepEqual(await translateFaqPair(indonesian, fakeAi({ question: indonesian.question, answer: indonesian.answer, noChange: true }).ai), { question: indonesian.question, answer: indonesian.answer, noChange: true });
  await rejectsValidation(() => translateFaqPair({ ...source, targetLocale: 'id' }, fakeAi({ question: 'May I register for 2 sessions? https://example.com/2', answer: 'Please arrive for 2 sessions.\nPay 10 EUR.', noChange: false }).ai));
  for (const sameScript of [
    { question: 'मैच कब शुरू होता है?', answer: 'कृपया मैच शुरू होने से पहले पहुँचें।', targetLocale: 'hi' },
    { question: 'การแข่งขันเริ่มเมื่อไหร่?', answer: 'กรุณามาถึงก่อนการแข่งขันเริ่ม', targetLocale: 'th' },
  ]) {
    const output = { question: sameScript.question, answer: sameScript.answer, noChange: true };
    assert.deepEqual(await translateFaqPair({ ...sameScript, sourceLocaleOverride: null }, fakeAi(output).ai), output);
  }
  for (const pinned of [
    { question: 'Када почиње утакмица?', answer: 'Утакмица почиње у подне.', targetLocale: 'sr' },
    { question: '比賽何時開始？', answer: '請在開始之前到場。', targetLocale: 'zh' },
  ]) {
    await rejectsValidation(() => translateFaqPair({ ...pinned, sourceLocaleOverride: null }, fakeAi({ question: pinned.question, answer: pinned.answer, noChange: true }).ai));
  }
  console.log('faqTranslator.test.ts: ok');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
