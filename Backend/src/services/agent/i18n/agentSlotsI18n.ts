/**
 * UI strings of `find_available_slots` (booking slice 7b), in the 11 app languages.
 * The confidence notes follow booking plan §14.3: a snapshot slot is "no known conflicts as
 * of HH:MM", never "free". English is the fallback. `sr` is Serbian Latin.
 */
import { agentLang } from './agentI18n';

export const AGENT_SLOTS_I18N_EN = {
  'label.findSlots': 'Looking for available courts',
  'summary.slots': 'Slots: {{count}} at {{clubs}} clubs',
  'summary.none': 'No matching slots',
  'note.live': 'Checked with the club booking system just now',
  'note.snapshot': 'No known conflicts as of {{time}}',
  'note.snapshotMissing': 'No club booking data for this date; only games in the app were checked',
  'note.appOnly': 'Only games in the app were checked; book with the club directly',
  'note.checkLive': 'Open the club page to check live availability',
} as const;

export type AgentSlotsI18nKey = keyof typeof AGENT_SLOTS_I18N_EN;
type Dictionary = Partial<Record<AgentSlotsI18nKey, string>>;

const ru: Dictionary = {
  'label.findSlots': 'Ищу свободные корты',
  'summary.slots': 'Слоты: {{count}}, клубов: {{clubs}}',
  'summary.none': 'Подходящих слотов нет',
  'note.live': 'Только что проверено в системе бронирования клуба',
  'note.snapshot': 'Известных пересечений нет на {{time}}',
  'note.snapshotMissing': 'Нет данных бронирования клуба на эту дату; проверены только игры в приложении',
  'note.appOnly': 'Проверены только игры в приложении; бронируйте напрямую в клубе',
  'note.checkLive': 'Откройте страницу клуба, чтобы проверить наличие',
};

const sr: Dictionary = {
  'label.findSlots': 'Tražim slobodne terene',
  'summary.slots': 'Termini: {{count}}, klubova: {{clubs}}',
  'summary.none': 'Nema odgovarajućih termina',
  'note.live': 'Upravo provereno u sistemu rezervacija kluba',
  'note.snapshot': 'Nema poznatih preklapanja u {{time}}',
  'note.snapshotMissing': 'Nema podataka o rezervacijama kluba za ovaj datum; provereni su samo mečevi u aplikaciji',
  'note.appOnly': 'Provereni su samo mečevi u aplikaciji; rezervišite direktno kod kluba',
  'note.checkLive': 'Otvorite stranicu kluba da proverite dostupnost uživo',
};

const es: Dictionary = {
  'label.findSlots': 'Buscando pistas disponibles',
  'summary.slots': 'Horarios: {{count}} en {{clubs}} clubes',
  'summary.none': 'No hay horarios que encajen',
  'note.live': 'Comprobado ahora mismo con el sistema de reservas del club',
  'note.snapshot': 'Sin conflictos conocidos a las {{time}}',
  'note.snapshotMissing': 'No hay datos de reservas del club para esta fecha; solo se revisaron los partidos de la app',
  'note.appOnly': 'Solo se revisaron los partidos de la app; reserva directamente con el club',
  'note.checkLive': 'Abre la página del club para comprobar la disponibilidad en vivo',
};

const cs: Dictionary = {
  'label.findSlots': 'Hledám volné kurty',
  'summary.slots': 'Termíny: {{count}}, klubů: {{clubs}}',
  'summary.none': 'Žádné vhodné termíny',
  'note.live': 'Právě ověřeno v rezervačním systému klubu',
  'note.snapshot': 'Žádné známé kolize k {{time}}',
  'note.snapshotMissing': 'Pro toto datum nejsou data rezervací klubu; ověřeny jen hry v aplikaci',
  'note.appOnly': 'Ověřeny jen hry v aplikaci; rezervujte přímo u klubu',
  'note.checkLive': 'Otevřete stránku klubu a ověřte dostupnost živě',
};

const ar: Dictionary = {
  'label.findSlots': 'جارٍ البحث عن ملاعب متاحة',
  'summary.slots': 'المواعيد: {{count}} في {{clubs}} نوادٍ',
  'summary.none': 'لا توجد مواعيد مناسبة',
  'note.live': 'تم التحقق للتو من نظام حجز النادي',
  'note.snapshot': 'لا تعارضات معروفة حتى {{time}}',
  'note.snapshotMissing': 'لا توجد بيانات حجز للنادي في هذا التاريخ؛ تم التحقق من مباريات التطبيق فقط',
  'note.appOnly': 'تم التحقق من مباريات التطبيق فقط؛ احجز مباشرة مع النادي',
  'note.checkLive': 'افتح صفحة النادي للتحقق من التوفر مباشرة',
};

const zh: Dictionary = {
  'label.findSlots': '正在查找可用场地',
  'summary.slots': '时段：{{count}} 个，俱乐部：{{clubs}} 家',
  'summary.none': '没有合适的时段',
  'note.live': '刚刚已在俱乐部预订系统中确认',
  'note.snapshot': '截至 {{time}} 无已知冲突',
  'note.snapshotMissing': '该日期没有俱乐部预订数据；仅检查了应用内的比赛',
  'note.appOnly': '仅检查了应用内的比赛；请直接向俱乐部预订',
  'note.checkLive': '打开俱乐部页面查看实时空位',
};

const id: Dictionary = {
  'label.findSlots': 'Mencari lapangan yang tersedia',
  'summary.slots': 'Slot: {{count}} di {{clubs}} klub',
  'summary.none': 'Tidak ada slot yang cocok',
  'note.live': 'Baru saja dicek di sistem pemesanan klub',
  'note.snapshot': 'Tidak ada bentrok yang diketahui per {{time}}',
  'note.snapshotMissing': 'Tidak ada data pemesanan klub untuk tanggal ini; hanya permainan di aplikasi yang dicek',
  'note.appOnly': 'Hanya permainan di aplikasi yang dicek; pesan langsung ke klub',
  'note.checkLive': 'Buka halaman klub untuk cek ketersediaan langsung',
};

const hi: Dictionary = {
  'label.findSlots': 'उपलब्ध कोर्ट खोज रहे हैं',
  'summary.slots': 'स्लॉट: {{count}}, क्लब: {{clubs}}',
  'summary.none': 'कोई उपयुक्त स्लॉट नहीं',
  'note.live': 'अभी-अभी क्लब की बुकिंग प्रणाली में जाँचा गया',
  'note.snapshot': '{{time}} तक कोई ज्ञात टकराव नहीं',
  'note.snapshotMissing': 'इस तारीख के लिए क्लब का बुकिंग डेटा नहीं है; केवल ऐप के गेम जाँचे गए',
  'note.appOnly': 'केवल ऐप के गेम जाँचे गए; सीधे क्लब से बुक करें',
  'note.checkLive': 'लाइव उपलब्धता देखने के लिए क्लब पेज खोलें',
};

const th: Dictionary = {
  'label.findSlots': 'กำลังค้นหาคอร์ตที่ว่าง',
  'summary.slots': 'ช่วงเวลา: {{count}} ใน {{clubs}} คลับ',
  'summary.none': 'ไม่มีช่วงเวลาที่ตรงกัน',
  'note.live': 'เพิ่งตรวจสอบกับระบบจองของคลับ',
  'note.snapshot': 'ไม่พบการชนกันที่ทราบ ณ {{time}}',
  'note.snapshotMissing': 'ไม่มีข้อมูลการจองของคลับสำหรับวันนี้ ตรวจสอบเฉพาะเกมในแอป',
  'note.appOnly': 'ตรวจสอบเฉพาะเกมในแอป โปรดจองกับคลับโดยตรง',
  'note.checkLive': 'เปิดหน้าคลับเพื่อตรวจสอบสถานะแบบสด',
};

const ja: Dictionary = {
  'label.findSlots': '空いているコートを検索中',
  'summary.slots': '枠：{{count}}件（{{clubs}}クラブ）',
  'summary.none': '条件に合う枠はありません',
  'note.live': 'クラブの予約システムでたった今確認しました',
  'note.snapshot': '{{time}} 時点で既知の重複なし',
  'note.snapshotMissing': 'この日付のクラブ予約データがありません。アプリ内の試合のみ確認しました',
  'note.appOnly': 'アプリ内の試合のみ確認しました。クラブに直接予約してください',
  'note.checkLive': 'クラブページを開いて最新の空き状況を確認してください',
};

export const AGENT_SLOTS_I18N_TRANSLATIONS: Record<string, Dictionary> = { ru, sr, es, cs, ar, zh, id, hi, th, ja };

export function agentSlotsT(
  locale: string | null | undefined,
  key: AgentSlotsI18nKey,
  vars: Record<string, string | number> = {},
): string {
  const template = AGENT_SLOTS_I18N_TRANSLATIONS[agentLang(locale)]?.[key] ?? AGENT_SLOTS_I18N_EN[key] ?? key;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}
