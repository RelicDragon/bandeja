// @vitest-environment jsdom
import { createInstance } from 'i18next';
import { beforeAll, describe, expect, it } from 'vitest';
import appI18n, { APP_UI_LANGUAGES } from './config';

const bookingKeys = [
  'verifyBooking', 'verifyingBooking', 'stillBookedTitle', 'stillBookedBody', 'verifyFailed',
  'removeMissingTitle', 'removeMissingBody', 'removeMissingConfirm', 'removeMissingSuccess', 'removeMissingFailed',
  'cancelBooking', 'cancelingBooking', 'cancelTooLate', 'cancelOutsidePolicyTitle', 'cancelOutsidePolicyBody',
  'cancelConfirmTitle', 'cancelConfirmBody', 'cancelConfirmLinkedBody', 'cancelConfirmCta',
  'cancelSuccess', 'cancelFailed', 'cancelLinkedGameBanner', 'openLinkedGame',
].map((key) => `club.booktime.${key}`);
const commonKeys = ['ok', 'cancel', 'continue', 'close', 'deleting'].map((key) => `common.${key}`);
const i18n = createInstance();

beforeAll(async () => {
  await i18n.init({
    resources: appI18n.options.resources,
    lng: 'en', fallbackLng: false,
    interpolation: { escapeValue: false },
  });
});

describe('booking actions in every supported UI language', () => {
  it.each(APP_UI_LANGUAGES)('%s contains the entire verify and cancellation flows without fallback', (lng) => {
    for (const key of [...bookingKeys, ...commonKeys]) {
      const value = i18n.getResource(lng, 'translation', key);
      expect(typeof value, `${lng}.${key}`).toBe('string');
      expect(value.trim(), `${lng}.${key}`).not.toBe('');
      if (lng !== 'en' && bookingKeys.includes(key)) {
        expect(value, `${lng}.${key}`).not.toBe(i18n.getResource('en', 'translation', key));
      }
      const translated = i18n.t(key, { lng, hours: 8, count: 8 });
      expect(translated, `${lng}.${key}`).not.toBe(key);
      expect(translated, `${lng}.${key}`).not.toMatch(/\{\{|\}\}/);
    }
  });

  it.each(APP_UI_LANGUAGES)('%s interpolates the club notice for short and long cancellation windows', (lng) => {
    for (const hours of [1, 2, 5, 8, 12, 24]) {
      const text = i18n.t('club.booktime.cancelOutsidePolicyBody', { lng, hours, count: hours });
      expect(text).not.toMatch(/\{\{|\}\}/);
      if (lng === 'ar' && hours <= 2) {
        expect(text).toContain(hours === 1 ? 'بساعة واحدة' : 'بساعتين');
      } else {
        expect(text).toContain(String(hours));
      }
    }
  });

  it.each([
    ['en', 1, '1 hour before'], ['en', 2, '2 hours before'],
    ['cs', 1, '1 hodinu'], ['cs', 2, '2 hodiny'], ['cs', 5, '5 hodin'],
    ['sr', 1, '1 sat'], ['sr', 2, '2 sata'], ['sr', 5, '5 sati'],
    ['es', 1, '1 hora'], ['es', 2, '2 horas'], ['ar', 5, '5 ساعات'],
  ])('uses the correct hour form in %s for %s', (lng, hours, expected) => {
    expect(i18n.t('club.booktime.cancelOutsidePolicyBody', { lng: String(lng), hours, count: Number(hours) }))
      .toContain(expected);
  });

  it('keeps Thai cancellation text translated and Chinese notice direction correct', () => {
    for (const key of ['cancelConfirmBody', 'cancelConfirmLinkedBody']) {
      expect(i18n.t(`club.booktime.${key}`, { lng: 'th', hours: 8 })).not.toMatch(/[a-z]/i);
      const chinese = i18n.t(`club.booktime.${key}`, { lng: 'zh', hours: 8 });
      expect(chinese).toContain('至少');
      expect(chinese).not.toContain('小时内');
    }
  });
});
