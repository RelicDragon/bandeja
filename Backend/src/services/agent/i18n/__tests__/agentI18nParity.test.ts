/**
 * Parity of every agent i18n dictionary (no DB): all 11 app languages exist, each has
 * exactly the English keys, and every string keeps the English `{{placeholders}}`.
 */
import assert from 'node:assert/strict';
import { AGENT_ADMIN_I18N_EN, AGENT_ADMIN_I18N_TRANSLATIONS } from '../agentAdminI18n';
import { AGENT_BOOKING_I18N_EN, AGENT_BOOKING_I18N_TRANSLATIONS } from '../agentBookingI18n';
import { AGENT_CANCEL_BOOKING_I18N_EN, AGENT_CANCEL_BOOKING_I18N_TRANSLATIONS } from '../agentCancelBookingI18n';
import { AGENT_CANCEL_GAME_I18N_EN, AGENT_CANCEL_GAME_I18N_TRANSLATIONS } from '../agentCancelGameI18n';
import { AGENT_GAME_CHAT_I18N_EN, AGENT_GAME_CHAT_I18N_TRANSLATIONS } from '../agentGameChatI18n';
import { AGENT_HELP_I18N_EN, AGENT_HELP_I18N_TRANSLATIONS } from '../agentHelpI18n';
import { AGENT_I18N_EN, AGENT_LOCALES } from '../agentI18n';
import { AGENT_I18N_TRANSLATIONS } from '../agentI18nTranslations';
import { AGENT_LEAGUE_I18N_EN, AGENT_LEAGUE_I18N_TRANSLATIONS } from '../agentLeagueI18n';
import { AGENT_MEMORY_I18N_EN, AGENT_MEMORY_I18N_TRANSLATIONS } from '../agentMemoryI18n';
import { AGENT_MONEY_I18N_EN, AGENT_MONEY_I18N_TRANSLATIONS } from '../agentMoneyI18n';
import { AGENT_PLAY_INTENT_I18N_EN, AGENT_PLAY_INTENT_I18N_TRANSLATIONS } from '../agentPlayIntentI18n';
import { AGENT_RESULTS_I18N_EN, AGENT_RESULTS_I18N_TRANSLATIONS } from '../agentResultsI18n';
import { AGENT_ROSTER_I18N_EN, AGENT_ROSTER_I18N_TRANSLATIONS } from '../agentRosterI18n';
import { AGENT_SLOTS_I18N_EN, AGENT_SLOTS_I18N_TRANSLATIONS } from '../agentSlotsI18n';
import { AGENT_TOOL_PERMISSION_I18N_EN, AGENT_TOOL_PERMISSION_I18N_TRANSLATIONS } from '../agentToolPermissionI18n';
import { AGENT_WEATHER_I18N_EN, AGENT_WEATHER_I18N_TRANSLATIONS } from '../agentWeatherI18n';
import { AGENT_WEB_I18N_EN, AGENT_WEB_I18N_TRANSLATIONS } from '../agentWebI18n';

type Dictionaries = { en: Record<string, string>; translations: Record<string, Partial<Record<string, string>>> };

const DICTIONARIES: Record<string, Dictionaries> = {
  agentI18n: { en: AGENT_I18N_EN, translations: AGENT_I18N_TRANSLATIONS },
  agentAdminI18n: { en: AGENT_ADMIN_I18N_EN, translations: AGENT_ADMIN_I18N_TRANSLATIONS },
  agentBookingI18n: { en: AGENT_BOOKING_I18N_EN, translations: AGENT_BOOKING_I18N_TRANSLATIONS },
  agentCancelBookingI18n: { en: AGENT_CANCEL_BOOKING_I18N_EN, translations: AGENT_CANCEL_BOOKING_I18N_TRANSLATIONS },
  agentCancelGameI18n: { en: AGENT_CANCEL_GAME_I18N_EN, translations: AGENT_CANCEL_GAME_I18N_TRANSLATIONS },
  agentGameChatI18n: { en: AGENT_GAME_CHAT_I18N_EN, translations: AGENT_GAME_CHAT_I18N_TRANSLATIONS },
  agentHelpI18n: { en: AGENT_HELP_I18N_EN, translations: AGENT_HELP_I18N_TRANSLATIONS },
  agentLeagueI18n: { en: AGENT_LEAGUE_I18N_EN, translations: AGENT_LEAGUE_I18N_TRANSLATIONS },
  agentMemoryI18n: { en: AGENT_MEMORY_I18N_EN, translations: AGENT_MEMORY_I18N_TRANSLATIONS },
  agentMoneyI18n: { en: AGENT_MONEY_I18N_EN, translations: AGENT_MONEY_I18N_TRANSLATIONS },
  agentPlayIntentI18n: { en: AGENT_PLAY_INTENT_I18N_EN, translations: AGENT_PLAY_INTENT_I18N_TRANSLATIONS },
  agentResultsI18n: { en: AGENT_RESULTS_I18N_EN, translations: AGENT_RESULTS_I18N_TRANSLATIONS },
  agentRosterI18n: { en: AGENT_ROSTER_I18N_EN, translations: AGENT_ROSTER_I18N_TRANSLATIONS },
  agentSlotsI18n: { en: AGENT_SLOTS_I18N_EN, translations: AGENT_SLOTS_I18N_TRANSLATIONS },
  agentToolPermissionI18n: { en: AGENT_TOOL_PERMISSION_I18N_EN, translations: AGENT_TOOL_PERMISSION_I18N_TRANSLATIONS },
  agentWeatherI18n: { en: AGENT_WEATHER_I18N_EN, translations: AGENT_WEATHER_I18N_TRANSLATIONS },
  agentWebI18n: { en: AGENT_WEB_I18N_EN, translations: AGENT_WEB_I18N_TRANSLATIONS },
};

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();
}

assert.equal(AGENT_LOCALES.length, 11, 'the app has 11 languages');
let checked = 0;
for (const [file, { en, translations }] of Object.entries(DICTIONARIES)) {
  const enKeys = Object.keys(en).sort();
  const locales = ['en', ...Object.keys(translations)].sort();
  assert.deepEqual(locales, [...AGENT_LOCALES].sort(), `${file}: exactly the 11 app languages`);
  for (const [locale, dictionary] of Object.entries(translations)) {
    assert.deepEqual(Object.keys(dictionary).sort(), enKeys, `${file}/${locale}: same keys as en`);
    for (const key of enKeys) {
      const text = dictionary[key] ?? '';
      assert.ok(text.trim().length > 0, `${file}/${locale}/${key}: not empty`);
      assert.deepEqual(placeholders(text), placeholders(en[key]), `${file}/${locale}/${key}: same placeholders`);
      checked += 1;
    }
  }
}

console.log(`agentI18nParity.test.ts: ok (${Object.keys(DICTIONARIES).length} dictionaries, ${checked} strings)`);
