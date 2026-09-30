/**
 * UI strings of the agent's game chat tools (slice 9c, docs/plans/ai-agent.md §16.3):
 * `summarize_game_chat`, `post_to_game_chat`, in the 11 app languages. English is the
 * fallback for a missing language or key. `sr` is Serbian Latin.
 */
import { agentLang } from './agentI18n';

export const AGENT_GAME_CHAT_I18N_EN = {
  'label.summarize': 'Reading the game chat',
  'label.post': 'Preparing a chat message',
  'summary.messages': 'Chat messages read: {{count}}',
  'preview.title': 'Post in the chat of "{{game}}"',
  'field.message': 'Message',
  'field.readers': 'Chat members',
  'warn.postedAsYou': 'The message is posted as you; chat members get the usual notification.',
  'result.posted': 'Message posted in the game chat',
  'handoff.openChat': 'Open the chat',
} as const;

export type AgentGameChatI18nKey = keyof typeof AGENT_GAME_CHAT_I18N_EN;
type Dictionary = Partial<Record<AgentGameChatI18nKey, string>>;

const ru: Dictionary = {
  'label.summarize': 'Читаю чат игры',
  'label.post': 'Готовлю сообщение в чат',
  'summary.messages': 'Прочитано сообщений: {{count}}',
  'preview.title': 'Написать в чат «{{game}}»',
  'field.message': 'Сообщение',
  'field.readers': 'Участники чата',
  'warn.postedAsYou': 'Сообщение будет отправлено от вашего имени; участники чата получат обычное уведомление.',
  'result.posted': 'Сообщение отправлено в чат игры',
  'handoff.openChat': 'Открыть чат',
};

const sr: Dictionary = {
  'label.summarize': 'Čitam čet igre',
  'label.post': 'Pripremam poruku u četu',
  'summary.messages': 'Pročitano poruka: {{count}}',
  'preview.title': 'Pošalji u čet „{{game}}"',
  'field.message': 'Poruka',
  'field.readers': 'Članovi četa',
  'warn.postedAsYou': 'Poruka se šalje u tvoje ime; članovi četa dobijaju uobičajeno obaveštenje.',
  'result.posted': 'Poruka je poslata u čet igre',
  'handoff.openChat': 'Otvori čet',
};

const es: Dictionary = {
  'label.summarize': 'Leyendo el chat del partido',
  'label.post': 'Preparando un mensaje para el chat',
  'summary.messages': 'Mensajes leídos: {{count}}',
  'preview.title': 'Escribir en el chat de «{{game}}»',
  'field.message': 'Mensaje',
  'field.readers': 'Miembros del chat',
  'warn.postedAsYou': 'El mensaje se publica en tu nombre; los miembros del chat reciben la notificación habitual.',
  'result.posted': 'Mensaje publicado en el chat del partido',
  'handoff.openChat': 'Abrir el chat',
};

const cs: Dictionary = {
  'label.summarize': 'Čtu chat hry',
  'label.post': 'Připravuji zprávu do chatu',
  'summary.messages': 'Přečteno zpráv: {{count}}',
  'preview.title': 'Napsat do chatu „{{game}}“',
  'field.message': 'Zpráva',
  'field.readers': 'Členové chatu',
  'warn.postedAsYou': 'Zpráva se odešle tvým jménem; členové chatu dostanou běžné upozornění.',
  'result.posted': 'Zpráva odeslána do chatu hry',
  'handoff.openChat': 'Otevřít chat',
};

const ar: Dictionary = {
  'label.summarize': 'قراءة دردشة المباراة',
  'label.post': 'تحضير رسالة للدردشة',
  'summary.messages': 'الرسائل المقروءة: {{count}}',
  'preview.title': 'النشر في دردشة "{{game}}"',
  'field.message': 'الرسالة',
  'field.readers': 'أعضاء الدردشة',
  'warn.postedAsYou': 'تُنشر الرسالة باسمك، ويتلقى أعضاء الدردشة الإشعار المعتاد.',
  'result.posted': 'تم نشر الرسالة في دردشة المباراة',
  'handoff.openChat': 'فتح الدردشة',
};

const zh: Dictionary = {
  'label.summarize': '正在读取比赛聊天',
  'label.post': '正在准备聊天消息',
  'summary.messages': '已读取消息：{{count}}',
  'preview.title': '在“{{game}}”的聊天中发送',
  'field.message': '消息',
  'field.readers': '聊天成员',
  'warn.postedAsYou': '消息将以你的名义发送；聊天成员会收到常规通知。',
  'result.posted': '消息已发送到比赛聊天',
  'handoff.openChat': '打开聊天',
};

const id: Dictionary = {
  'label.summarize': 'Membaca obrolan permainan',
  'label.post': 'Menyiapkan pesan obrolan',
  'summary.messages': 'Pesan dibaca: {{count}}',
  'preview.title': 'Kirim ke obrolan "{{game}}"',
  'field.message': 'Pesan',
  'field.readers': 'Anggota obrolan',
  'warn.postedAsYou': 'Pesan dikirim atas namamu; anggota obrolan menerima notifikasi seperti biasa.',
  'result.posted': 'Pesan terkirim ke obrolan permainan',
  'handoff.openChat': 'Buka obrolan',
};

const hi: Dictionary = {
  'label.summarize': 'गेम चैट पढ़ी जा रही है',
  'label.post': 'चैट संदेश तैयार किया जा रहा है',
  'summary.messages': 'पढ़े गए संदेश: {{count}}',
  'preview.title': '"{{game}}" की चैट में भेजें',
  'field.message': 'संदेश',
  'field.readers': 'चैट सदस्य',
  'warn.postedAsYou': 'संदेश आपके नाम से भेजा जाएगा; चैट सदस्यों को सामान्य सूचना मिलेगी।',
  'result.posted': 'संदेश गेम चैट में भेज दिया गया',
  'handoff.openChat': 'चैट खोलें',
};

const th: Dictionary = {
  'label.summarize': 'กำลังอ่านแชทของเกม',
  'label.post': 'กำลังเตรียมข้อความแชท',
  'summary.messages': 'อ่านข้อความแล้ว: {{count}}',
  'preview.title': 'โพสต์ในแชทของ "{{game}}"',
  'field.message': 'ข้อความ',
  'field.readers': 'สมาชิกแชท',
  'warn.postedAsYou': 'ข้อความจะโพสต์ในนามของคุณ และสมาชิกแชทจะได้รับการแจ้งเตือนตามปกติ',
  'result.posted': 'โพสต์ข้อความในแชทของเกมแล้ว',
  'handoff.openChat': 'เปิดแชท',
};

const ja: Dictionary = {
  'label.summarize': 'ゲームチャットを読んでいます',
  'label.post': 'チャットメッセージを準備中',
  'summary.messages': '読んだメッセージ: {{count}}',
  'preview.title': '「{{game}}」のチャットに投稿',
  'field.message': 'メッセージ',
  'field.readers': 'チャットメンバー',
  'warn.postedAsYou': 'メッセージはあなたの名前で投稿され、チャットメンバーには通常どおり通知が届きます。',
  'result.posted': 'ゲームチャットに投稿しました',
  'handoff.openChat': 'チャットを開く',
};

export const AGENT_GAME_CHAT_I18N_TRANSLATIONS: Record<string, Dictionary> = { ru, sr, es, cs, ar, zh, id, hi, th, ja };

export function agentGameChatT(
  locale: string | null | undefined,
  key: AgentGameChatI18nKey,
  vars: Record<string, string | number> = {},
): string {
  const template = AGENT_GAME_CHAT_I18N_TRANSLATIONS[agentLang(locale)]?.[key] ?? AGENT_GAME_CHAT_I18N_EN[key] ?? key;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}
