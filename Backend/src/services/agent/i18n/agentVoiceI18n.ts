/**
 * Spoken strings of agent voice v2 (`/agent-voice`), in the 11 app languages. English is the
 * fallback. Same wording as the app's v1 `agent.voice.confirmPrompt`.
 */
import { agentLang } from './agentI18n';

export const AGENT_VOICE_I18N_EN = {
  /** A run paused on a confirmation card without saying anything: the card title + this. */
  'voice.confirmPrompt': '{{title}}. Tap Confirm on the screen.',
  'voice.tapConfirm': 'Tap Confirm on the screen.',
} as const;

export type AgentVoiceI18nKey = keyof typeof AGENT_VOICE_I18N_EN;
type Dictionary = Partial<Record<AgentVoiceI18nKey, string>>;

export const AGENT_VOICE_I18N_TRANSLATIONS: Record<string, Dictionary> = {
  ru: { 'voice.confirmPrompt': '{{title}}. Нажмите «Подтвердить» на экране.', 'voice.tapConfirm': 'Нажмите «Подтвердить» на экране.' },
  sr: { 'voice.confirmPrompt': '{{title}}. Dodirni Potvrdi na ekranu.', 'voice.tapConfirm': 'Dodirni Potvrdi na ekranu.' },
  es: { 'voice.confirmPrompt': '{{title}}. Toca Confirmar en la pantalla.', 'voice.tapConfirm': 'Toca Confirmar en la pantalla.' },
  cs: { 'voice.confirmPrompt': '{{title}}. Klepněte na obrazovce na Potvrdit.', 'voice.tapConfirm': 'Klepněte na obrazovce na Potvrdit.' },
  ar: { 'voice.confirmPrompt': '{{title}}. اضغط تأكيد على الشاشة.', 'voice.tapConfirm': 'اضغط تأكيد على الشاشة.' },
  zh: { 'voice.confirmPrompt': '{{title}}。请在屏幕上点击确认。', 'voice.tapConfirm': '请在屏幕上点击确认。' },
  id: { 'voice.confirmPrompt': '{{title}}. Ketuk Konfirmasi di layar.', 'voice.tapConfirm': 'Ketuk Konfirmasi di layar.' },
  hi: { 'voice.confirmPrompt': '{{title}}. स्क्रीन पर पुष्टि करें पर टैप करें।', 'voice.tapConfirm': 'स्क्रीन पर पुष्टि करें पर टैप करें।' },
  th: { 'voice.confirmPrompt': '{{title}} แตะยืนยันบนหน้าจอ', 'voice.tapConfirm': 'แตะยืนยันบนหน้าจอ' },
  ja: { 'voice.confirmPrompt': '{{title}}。画面で「確認」をタップしてください。', 'voice.tapConfirm': '画面で「確認」をタップしてください。' },
};

export function agentVoiceT(
  locale: string | null | undefined,
  key: AgentVoiceI18nKey,
  vars: Record<string, string | number> = {},
): string {
  const template = AGENT_VOICE_I18N_TRANSLATIONS[agentLang(locale)]?.[key] ?? AGENT_VOICE_I18N_EN[key];
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}

/** What to say when a run waits for a tap on Confirm and the model said nothing. */
export function agentVoiceConfirmPrompt(locale: string | null | undefined, title: string | null): string {
  const clean = (title ?? '').trim();
  return clean ? agentVoiceT(locale, 'voice.confirmPrompt', { title: clean }) : agentVoiceT(locale, 'voice.tapConfirm');
}
