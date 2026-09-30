/**
 * UI strings of `get_weather` (slice 9d), in the 11 app languages. English is the fallback.
 * `sr` is Serbian Latin. Model-facing notes stay English (they are tool data, not UI).
 */
import { agentLang } from './agentI18n';

export const AGENT_WEATHER_I18N_EN = {
  'label.getWeather': 'Checking the weather',
  'summary.weather': 'Weather in {{city}}, {{date}}',
  'summary.unavailable': 'No forecast for {{date}} yet',
} as const;

export type AgentWeatherI18nKey = keyof typeof AGENT_WEATHER_I18N_EN;
type Dictionary = Partial<Record<AgentWeatherI18nKey, string>>;

const ru: Dictionary = {
  'label.getWeather': 'Смотрю погоду',
  'summary.weather': 'Погода: {{city}}, {{date}}',
  'summary.unavailable': 'Прогноза на {{date}} пока нет',
};

const sr: Dictionary = {
  'label.getWeather': 'Proveravam vreme',
  'summary.weather': 'Vreme: {{city}}, {{date}}',
  'summary.unavailable': 'Još nema prognoze za {{date}}',
};

const es: Dictionary = {
  'label.getWeather': 'Consultando el tiempo',
  'summary.weather': 'Tiempo en {{city}}, {{date}}',
  'summary.unavailable': 'Aún no hay pronóstico para {{date}}',
};

const cs: Dictionary = {
  'label.getWeather': 'Zjišťuji počasí',
  'summary.weather': 'Počasí: {{city}}, {{date}}',
  'summary.unavailable': 'Předpověď na {{date}} zatím není',
};

const ar: Dictionary = {
  'label.getWeather': 'جارٍ التحقق من الطقس',
  'summary.weather': 'الطقس في {{city}}، {{date}}',
  'summary.unavailable': 'لا توجد توقعات لـ {{date}} بعد',
};

const zh: Dictionary = {
  'label.getWeather': '正在查看天气',
  'summary.weather': '{{city}} 天气，{{date}}',
  'summary.unavailable': '{{date}} 暂无天气预报',
};

const id: Dictionary = {
  'label.getWeather': 'Memeriksa cuaca',
  'summary.weather': 'Cuaca di {{city}}, {{date}}',
  'summary.unavailable': 'Belum ada prakiraan untuk {{date}}',
};

const hi: Dictionary = {
  'label.getWeather': 'मौसम देख रहा हूँ',
  'summary.weather': '{{city}} का मौसम, {{date}}',
  'summary.unavailable': '{{date}} का पूर्वानुमान अभी उपलब्ध नहीं है',
};

const th: Dictionary = {
  'label.getWeather': 'กำลังตรวจสอบสภาพอากาศ',
  'summary.weather': 'สภาพอากาศที่ {{city}}, {{date}}',
  'summary.unavailable': 'ยังไม่มีพยากรณ์สำหรับ {{date}}',
};

const ja: Dictionary = {
  'label.getWeather': '天気を確認しています',
  'summary.weather': '{{city}}の天気、{{date}}',
  'summary.unavailable': '{{date}}の予報はまだありません',
};

export const AGENT_WEATHER_I18N_TRANSLATIONS: Record<string, Dictionary> = { ru, sr, es, cs, ar, zh, id, hi, th, ja };

export function agentWeatherT(
  locale: string | null | undefined,
  key: AgentWeatherI18nKey,
  vars: Record<string, string | number> = {},
): string {
  const template = AGENT_WEATHER_I18N_TRANSLATIONS[agentLang(locale)]?.[key] ?? AGENT_WEATHER_I18N_EN[key] ?? key;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}
