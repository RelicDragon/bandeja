/**
 * UI strings of `list_help` / `get_help`, in the 11
 * app languages. English is the fallback. `sr` is Serbian Latin. The help text itself is
 * model-facing data from `Backend/agent-help/` (labels localized via `labels.json`).
 */
import { agentLang } from './agentI18n';

export const AGENT_HELP_I18N_EN = {
  'label.listHelp': 'Checking the help topics',
  'label.getHelp': 'Reading the app help',
  'summary.index': '{{count}} help topics',
  'summary.topic': 'Help: {{topic}}',
  'summary.miss': 'No help topic "{{topic}}"',
} as const;

export type AgentHelpI18nKey = keyof typeof AGENT_HELP_I18N_EN;
type Dictionary = Partial<Record<AgentHelpI18nKey, string>>;

const ru: Dictionary = {
  'label.listHelp': 'Смотрю разделы справки',
  'label.getHelp': 'Читаю справку по приложению',
  'summary.index': 'Разделов справки: {{count}}',
  'summary.topic': 'Справка: {{topic}}',
  'summary.miss': 'Нет раздела справки «{{topic}}»',
};

const sr: Dictionary = {
  'label.listHelp': 'Proveravam teme pomoći',
  'label.getHelp': 'Čitam pomoć za aplikaciju',
  'summary.index': 'Tema pomoći: {{count}}',
  'summary.topic': 'Pomoć: {{topic}}',
  'summary.miss': 'Nema teme pomoći „{{topic}}“',
};

const es: Dictionary = {
  'label.listHelp': 'Consultando los temas de ayuda',
  'label.getHelp': 'Leyendo la ayuda de la app',
  'summary.index': '{{count}} temas de ayuda',
  'summary.topic': 'Ayuda: {{topic}}',
  'summary.miss': 'No hay tema de ayuda «{{topic}}»',
};

const cs: Dictionary = {
  'label.listHelp': 'Procházím témata nápovědy',
  'label.getHelp': 'Čtu nápovědu k aplikaci',
  'summary.index': 'Témat nápovědy: {{count}}',
  'summary.topic': 'Nápověda: {{topic}}',
  'summary.miss': 'Téma nápovědy „{{topic}}“ neexistuje',
};

const ar: Dictionary = {
  'label.listHelp': 'جارٍ التحقق من مواضيع المساعدة',
  'label.getHelp': 'جارٍ قراءة مساعدة التطبيق',
  'summary.index': 'مواضيع المساعدة: {{count}}',
  'summary.topic': 'المساعدة: {{topic}}',
  'summary.miss': 'لا يوجد موضوع مساعدة "{{topic}}"',
};

const zh: Dictionary = {
  'label.listHelp': '正在查看帮助主题',
  'label.getHelp': '正在阅读应用帮助',
  'summary.index': '{{count}} 个帮助主题',
  'summary.topic': '帮助：{{topic}}',
  'summary.miss': '没有帮助主题“{{topic}}”',
};

const id: Dictionary = {
  'label.listHelp': 'Memeriksa topik bantuan',
  'label.getHelp': 'Membaca bantuan aplikasi',
  'summary.index': '{{count}} topik bantuan',
  'summary.topic': 'Bantuan: {{topic}}',
  'summary.miss': 'Tidak ada topik bantuan "{{topic}}"',
};

const hi: Dictionary = {
  'label.listHelp': 'सहायता विषय देख रहा हूँ',
  'label.getHelp': 'ऐप सहायता पढ़ रहा हूँ',
  'summary.index': '{{count}} सहायता विषय',
  'summary.topic': 'सहायता: {{topic}}',
  'summary.miss': '"{{topic}}" नाम का कोई सहायता विषय नहीं है',
};

const th: Dictionary = {
  'label.listHelp': 'กำลังดูหัวข้อความช่วยเหลือ',
  'label.getHelp': 'กำลังอ่านความช่วยเหลือของแอป',
  'summary.index': 'หัวข้อความช่วยเหลือ {{count}} หัวข้อ',
  'summary.topic': 'ความช่วยเหลือ: {{topic}}',
  'summary.miss': 'ไม่มีหัวข้อความช่วยเหลือ "{{topic}}"',
};

const ja: Dictionary = {
  'label.listHelp': 'ヘルプのトピックを確認しています',
  'label.getHelp': 'アプリのヘルプを読んでいます',
  'summary.index': 'ヘルプのトピック {{count}} 件',
  'summary.topic': 'ヘルプ: {{topic}}',
  'summary.miss': 'ヘルプのトピック「{{topic}}」はありません',
};

export const AGENT_HELP_I18N_TRANSLATIONS: Record<string, Dictionary> = { ru, sr, es, cs, ar, zh, id, hi, th, ja };

export function agentHelpT(
  locale: string | null | undefined,
  key: AgentHelpI18nKey,
  vars: Record<string, string | number> = {},
): string {
  const template = AGENT_HELP_I18N_TRANSLATIONS[agentLang(locale)]?.[key] ?? AGENT_HELP_I18N_EN[key] ?? key;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}
