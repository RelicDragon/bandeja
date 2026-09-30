/**
 * UI strings of the league-owner agent tools (phase 4a: `get_league_schedule`,
 * `reschedule_league_fixture`, `send_league_round_start_message`), in the 11 app
 * languages. Kept apart from `agentI18n.ts` so the shared dictionary stays untouched;
 * shared field names (Start, Club, Court…) still come from `agentT`.
 * English is the fallback for a missing language or key. `sr` is Serbian Latin.
 */
import { agentLang } from './agentI18n';

export const AGENT_LEAGUE_I18N_EN = {
  'label.getLeagueSchedule': 'Checking the league schedule',
  'label.rescheduleFixture': 'Preparing a fixture change',
  'label.roundStartMessage': 'Preparing the round announcement',
  'summary.schedule': '{{title}}: fixtures ({{count}})',
  'preview.fixture.title': 'Change fixture: {{fixture}}',
  'preview.roundStart.title': 'Announce round {{round}}: {{season}}',
  'field.round': 'Round',
  'field.fixtures': 'Fixtures',
  'field.recipients': 'Players to notify',
  'value.round': 'Round {{round}}',
  'value.playoffRound': 'Playoff, round {{round}}',
  'warn.unscheduledFixtures': 'Fixtures without a time yet: {{count}}',
  'warn.onlyOnce': 'The announcement can be sent only once per round',
  'result.fixtureUpdated': 'Fixture updated',
  'result.roundAnnounced': 'Round announcement sent to {{count}} players',
} as const;

export type AgentLeagueI18nKey = keyof typeof AGENT_LEAGUE_I18N_EN;
type Dictionary = Partial<Record<AgentLeagueI18nKey, string>>;

const ru: Dictionary = {
  'label.getLeagueSchedule': 'Смотрю расписание лиги',
  'label.rescheduleFixture': 'Готовлю изменение матча',
  'label.roundStartMessage': 'Готовлю объявление тура',
  'summary.schedule': '{{title}}: матчи ({{count}})',
  'preview.fixture.title': 'Изменить матч: {{fixture}}',
  'preview.roundStart.title': 'Объявить тур {{round}}: {{season}}',
  'field.round': 'Тур',
  'field.fixtures': 'Матчи',
  'field.recipients': 'Кого уведомить',
  'value.round': 'Тур {{round}}',
  'value.playoffRound': 'Плей-офф, тур {{round}}',
  'warn.unscheduledFixtures': 'Матчей без времени: {{count}}',
  'warn.onlyOnce': 'Объявление тура можно отправить только один раз',
  'result.fixtureUpdated': 'Матч обновлён',
  'result.roundAnnounced': 'Объявление тура отправлено игрокам: {{count}}',
};

const sr: Dictionary = {
  'label.getLeagueSchedule': 'Proveravam raspored lige',
  'label.rescheduleFixture': 'Pripremam izmenu meča',
  'label.roundStartMessage': 'Pripremam najavu kola',
  'summary.schedule': '{{title}}: mečevi ({{count}})',
  'preview.fixture.title': 'Izmeni meč: {{fixture}}',
  'preview.roundStart.title': 'Najavi kolo {{round}}: {{season}}',
  'field.round': 'Kolo',
  'field.fixtures': 'Mečevi',
  'field.recipients': 'Igrači za obaveštenje',
  'value.round': 'Kolo {{round}}',
  'value.playoffRound': 'Plej-of, kolo {{round}}',
  'warn.unscheduledFixtures': 'Mečeva bez termina: {{count}}',
  'warn.onlyOnce': 'Najava se može poslati samo jednom po kolu',
  'result.fixtureUpdated': 'Meč je izmenjen',
  'result.roundAnnounced': 'Najava kola poslata igračima: {{count}}',
};

const es: Dictionary = {
  'label.getLeagueSchedule': 'Consultando el calendario de la liga',
  'label.rescheduleFixture': 'Preparando un cambio de partido',
  'label.roundStartMessage': 'Preparando el aviso de jornada',
  'summary.schedule': '{{title}}: partidos ({{count}})',
  'preview.fixture.title': 'Cambiar partido: {{fixture}}',
  'preview.roundStart.title': 'Anunciar jornada {{round}}: {{season}}',
  'field.round': 'Jornada',
  'field.fixtures': 'Partidos',
  'field.recipients': 'Jugadores a avisar',
  'value.round': 'Jornada {{round}}',
  'value.playoffRound': 'Playoff, jornada {{round}}',
  'warn.unscheduledFixtures': 'Partidos sin hora todavía: {{count}}',
  'warn.onlyOnce': 'El aviso solo se puede enviar una vez por jornada',
  'result.fixtureUpdated': 'Partido actualizado',
  'result.roundAnnounced': 'Aviso de jornada enviado a {{count}} jugadores',
};

const cs: Dictionary = {
  'label.getLeagueSchedule': 'Kontroluji rozpis ligy',
  'label.rescheduleFixture': 'Připravuji změnu zápasu',
  'label.roundStartMessage': 'Připravuji oznámení kola',
  'summary.schedule': '{{title}}: zápasy ({{count}})',
  'preview.fixture.title': 'Změnit zápas: {{fixture}}',
  'preview.roundStart.title': 'Oznámit kolo {{round}}: {{season}}',
  'field.round': 'Kolo',
  'field.fixtures': 'Zápasy',
  'field.recipients': 'Hráči k upozornění',
  'value.round': 'Kolo {{round}}',
  'value.playoffRound': 'Play-off, kolo {{round}}',
  'warn.unscheduledFixtures': 'Zápasy zatím bez času: {{count}}',
  'warn.onlyOnce': 'Oznámení lze pro kolo poslat jen jednou',
  'result.fixtureUpdated': 'Zápas upraven',
  'result.roundAnnounced': 'Oznámení kola odesláno hráčům: {{count}}',
};

const ar: Dictionary = {
  'label.getLeagueSchedule': 'جارٍ التحقق من جدول الدوري',
  'label.rescheduleFixture': 'جارٍ تجهيز تعديل المباراة',
  'label.roundStartMessage': 'جارٍ تجهيز إعلان الجولة',
  'summary.schedule': '{{title}}: المباريات ({{count}})',
  'preview.fixture.title': 'تعديل المباراة: {{fixture}}',
  'preview.roundStart.title': 'إعلان الجولة {{round}}: {{season}}',
  'field.round': 'الجولة',
  'field.fixtures': 'المباريات',
  'field.recipients': 'اللاعبون الذين سيتم إشعارهم',
  'value.round': 'الجولة {{round}}',
  'value.playoffRound': 'الأدوار الإقصائية، الجولة {{round}}',
  'warn.unscheduledFixtures': 'مباريات بلا موعد بعد: {{count}}',
  'warn.onlyOnce': 'يمكن إرسال إعلان الجولة مرة واحدة فقط',
  'result.fixtureUpdated': 'تم تحديث المباراة',
  'result.roundAnnounced': 'تم إرسال إعلان الجولة إلى {{count}} لاعبين',
};

const zh: Dictionary = {
  'label.getLeagueSchedule': '正在查看联赛赛程',
  'label.rescheduleFixture': '正在准备修改比赛',
  'label.roundStartMessage': '正在准备本轮通知',
  'summary.schedule': '{{title}}：比赛（{{count}}）',
  'preview.fixture.title': '修改比赛：{{fixture}}',
  'preview.roundStart.title': '发布第 {{round}} 轮通知：{{season}}',
  'field.round': '轮次',
  'field.fixtures': '比赛',
  'field.recipients': '将通知的球员',
  'value.round': '第 {{round}} 轮',
  'value.playoffRound': '季后赛，第 {{round}} 轮',
  'warn.unscheduledFixtures': '尚未定时间的比赛：{{count}}',
  'warn.onlyOnce': '每轮通知只能发送一次',
  'result.fixtureUpdated': '比赛已更新',
  'result.roundAnnounced': '本轮通知已发送给 {{count}} 名球员',
};

const id: Dictionary = {
  'label.getLeagueSchedule': 'Memeriksa jadwal liga',
  'label.rescheduleFixture': 'Menyiapkan perubahan pertandingan',
  'label.roundStartMessage': 'Menyiapkan pengumuman babak',
  'summary.schedule': '{{title}}: pertandingan ({{count}})',
  'preview.fixture.title': 'Ubah pertandingan: {{fixture}}',
  'preview.roundStart.title': 'Umumkan babak {{round}}: {{season}}',
  'field.round': 'Babak',
  'field.fixtures': 'Pertandingan',
  'field.recipients': 'Pemain yang diberi tahu',
  'value.round': 'Babak {{round}}',
  'value.playoffRound': 'Playoff, babak {{round}}',
  'warn.unscheduledFixtures': 'Pertandingan belum berjadwal: {{count}}',
  'warn.onlyOnce': 'Pengumuman hanya bisa dikirim sekali per babak',
  'result.fixtureUpdated': 'Pertandingan diperbarui',
  'result.roundAnnounced': 'Pengumuman babak dikirim ke {{count}} pemain',
};

const hi: Dictionary = {
  'label.getLeagueSchedule': 'लीग का शेड्यूल देख रहा हूँ',
  'label.rescheduleFixture': 'मैच में बदलाव तैयार कर रहा हूँ',
  'label.roundStartMessage': 'राउंड की घोषणा तैयार कर रहा हूँ',
  'summary.schedule': '{{title}}: मैच ({{count}})',
  'preview.fixture.title': 'मैच बदलें: {{fixture}}',
  'preview.roundStart.title': 'राउंड {{round}} की घोषणा: {{season}}',
  'field.round': 'राउंड',
  'field.fixtures': 'मैच',
  'field.recipients': 'सूचित किए जाने वाले खिलाड़ी',
  'value.round': 'राउंड {{round}}',
  'value.playoffRound': 'प्लेऑफ़, राउंड {{round}}',
  'warn.unscheduledFixtures': 'बिना समय वाले मैच: {{count}}',
  'warn.onlyOnce': 'हर राउंड की घोषणा सिर्फ़ एक बार भेजी जा सकती है',
  'result.fixtureUpdated': 'मैच अपडेट हो गया',
  'result.roundAnnounced': 'राउंड की घोषणा {{count}} खिलाड़ियों को भेजी गई',
};

const th: Dictionary = {
  'label.getLeagueSchedule': 'กำลังดูตารางลีก',
  'label.rescheduleFixture': 'กำลังเตรียมแก้ไขแมตช์',
  'label.roundStartMessage': 'กำลังเตรียมประกาศรอบ',
  'summary.schedule': '{{title}}: แมตช์ ({{count}})',
  'preview.fixture.title': 'แก้ไขแมตช์: {{fixture}}',
  'preview.roundStart.title': 'ประกาศรอบ {{round}}: {{season}}',
  'field.round': 'รอบ',
  'field.fixtures': 'แมตช์',
  'field.recipients': 'ผู้เล่นที่จะได้รับแจ้ง',
  'value.round': 'รอบ {{round}}',
  'value.playoffRound': 'เพลย์ออฟ รอบ {{round}}',
  'warn.unscheduledFixtures': 'แมตช์ที่ยังไม่มีเวลา: {{count}}',
  'warn.onlyOnce': 'ประกาศรอบส่งได้เพียงครั้งเดียวต่อรอบ',
  'result.fixtureUpdated': 'อัปเดตแมตช์แล้ว',
  'result.roundAnnounced': 'ส่งประกาศรอบถึงผู้เล่น {{count}} คนแล้ว',
};

const ja: Dictionary = {
  'label.getLeagueSchedule': 'リーグの日程を確認中',
  'label.rescheduleFixture': '試合の変更を準備中',
  'label.roundStartMessage': 'ラウンドのお知らせを準備中',
  'summary.schedule': '{{title}}：試合（{{count}}）',
  'preview.fixture.title': '試合を変更：{{fixture}}',
  'preview.roundStart.title': 'ラウンド {{round}} を告知：{{season}}',
  'field.round': 'ラウンド',
  'field.fixtures': '試合',
  'field.recipients': '通知するプレイヤー',
  'value.round': 'ラウンド {{round}}',
  'value.playoffRound': 'プレーオフ、ラウンド {{round}}',
  'warn.unscheduledFixtures': '時間未定の試合：{{count}}',
  'warn.onlyOnce': 'お知らせは各ラウンド1回だけ送信できます',
  'result.fixtureUpdated': '試合を更新しました',
  'result.roundAnnounced': 'ラウンドのお知らせを {{count}} 人に送信しました',
};

export const AGENT_LEAGUE_I18N_TRANSLATIONS: Record<string, Dictionary> = { ru, sr, es, cs, ar, zh, id, hi, th, ja };

export function agentLeagueT(
  locale: string | null | undefined,
  key: AgentLeagueI18nKey,
  vars: Record<string, string | number> = {},
): string {
  const template = AGENT_LEAGUE_I18N_TRANSLATIONS[agentLang(locale)]?.[key] ?? AGENT_LEAGUE_I18N_EN[key] ?? key;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}
