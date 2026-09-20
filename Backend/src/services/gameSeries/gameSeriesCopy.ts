/**
 * PRD 345 — backend copy for the "same time next week?" prompt.
 *
 * Kept in this module rather than appended to `utils/translations.ts` on
 * purpose: that file is one flat object per locale that a dozen other agents
 * are editing in the same programme, and eleven insertions into it would be a
 * guaranteed merge conflict for zero behavioural gain. The resolver below has
 * the same contract as `t(key, lang)` — unknown language falls back to English,
 * unknown key returns the key — so the call sites read identically.
 */

export type SeriesCopyKey =
  | 'series.nextWeekTitle'
  | 'series.nextWeekBody'
  | 'series.nextWeekBodyAtClub'
  | 'series.actionImIn'
  | 'series.actionNotThisTime'
  | 'series.seatKept'
  | 'series.seatReleased'
  | 'series.promptExpired';

type SeriesCopyBundle = Record<SeriesCopyKey, string>;

const SERIES_COPY: Record<string, SeriesCopyBundle> = {
  en: {
    'series.nextWeekTitle': 'Same time next week?',
    'series.nextWeekBody': '{when} — keep your seat in {series}',
    'series.nextWeekBodyAtClub': '{when} at {club} — keep your seat in {series}',
    'series.actionImIn': "I'm in",
    'series.actionNotThisTime': 'Not this time',
    'series.seatKept': 'Seat kept',
    'series.seatReleased': 'Okay — your seat opens to others',
    'series.promptExpired': 'That game is no longer open',
  },
  ru: {
    'series.nextWeekTitle': 'В то же время на следующей неделе?',
    'series.nextWeekBody': '{when} — оставьте за собой место в «{series}»',
    'series.nextWeekBodyAtClub': '{when} в «{club}» — оставьте за собой место в «{series}»',
    'series.actionImIn': 'Я играю',
    'series.actionNotThisTime': 'В этот раз нет',
    'series.seatKept': 'Место сохранено',
    'series.seatReleased': 'Хорошо — ваше место освободится для других',
    'series.promptExpired': 'Эта игра больше не открыта',
  },
  sr: {
    'series.nextWeekTitle': 'Isto vreme sledeće nedelje?',
    'series.nextWeekBody': '{when} — zadrži svoje mesto u „{series}“',
    'series.nextWeekBodyAtClub': '{when} u „{club}“ — zadrži svoje mesto u „{series}“',
    'series.actionImIn': 'Igram',
    'series.actionNotThisTime': 'Ne ovaj put',
    'series.seatKept': 'Mesto je zadržano',
    'series.seatReleased': 'U redu — tvoje mesto se otvara za druge',
    'series.promptExpired': 'Ta igra više nije otvorena',
  },
  es: {
    'series.nextWeekTitle': '¿La semana que viene a la misma hora?',
    'series.nextWeekBody': '{when}: guarda tu plaza en «{series}»',
    'series.nextWeekBodyAtClub': '{when} en {club}: guarda tu plaza en «{series}»',
    'series.actionImIn': 'Me apunto',
    'series.actionNotThisTime': 'Esta vez no',
    'series.seatKept': 'Plaza guardada',
    'series.seatReleased': 'De acuerdo, tu plaza queda libre para otros',
    'series.promptExpired': 'Ese partido ya no está abierto',
  },
  cs: {
    'series.nextWeekTitle': 'Příští týden ve stejnou dobu?',
    'series.nextWeekBody': '{when} — nech si své místo v „{series}“',
    'series.nextWeekBodyAtClub': '{when} v {club} — nech si své místo v „{series}“',
    'series.actionImIn': 'Jdu do toho',
    'series.actionNotThisTime': 'Tentokrát ne',
    'series.seatKept': 'Místo zůstalo tvoje',
    'series.seatReleased': 'Dobře — tvoje místo se uvolní ostatním',
    'series.promptExpired': 'Tato hra už není otevřená',
  },
  ar: {
    'series.nextWeekTitle': 'نفس الموعد الأسبوع القادم؟',
    'series.nextWeekBody': '{when} — احتفظ بمقعدك في «{series}»',
    'series.nextWeekBodyAtClub': '{when} في {club} — احتفظ بمقعدك في «{series}»',
    'series.actionImIn': 'أنا معكم',
    'series.actionNotThisTime': 'ليس هذه المرة',
    'series.seatKept': 'تم حفظ المقعد',
    'series.seatReleased': 'حسنًا — سيصبح مقعدك متاحًا للآخرين',
    'series.promptExpired': 'لم تعد هذه المباراة مفتوحة',
  },
  zh: {
    'series.nextWeekTitle': '下周同一时间？',
    'series.nextWeekBody': '{when}——保留你在「{series}」中的位置',
    'series.nextWeekBodyAtClub': '{when} 在 {club}——保留你在「{series}」中的位置',
    'series.actionImIn': '我参加',
    'series.actionNotThisTime': '这次不了',
    'series.seatKept': '位置已保留',
    'series.seatReleased': '好的，你的位置将开放给其他人',
    'series.promptExpired': '该活动已不再开放',
  },
  id: {
    'series.nextWeekTitle': 'Jam yang sama minggu depan?',
    'series.nextWeekBody': '{when} — simpan tempatmu di "{series}"',
    'series.nextWeekBodyAtClub': '{when} di {club} — simpan tempatmu di "{series}"',
    'series.actionImIn': 'Saya ikut',
    'series.actionNotThisTime': 'Kali ini tidak',
    'series.seatKept': 'Tempat disimpan',
    'series.seatReleased': 'Baik — tempatmu dibuka untuk yang lain',
    'series.promptExpired': 'Permainan itu sudah tidak terbuka',
  },
  hi: {
    'series.nextWeekTitle': 'अगले हफ़्ते उसी समय?',
    'series.nextWeekBody': '{when} — «{series}» में अपनी जगह बनाए रखें',
    'series.nextWeekBodyAtClub': '{when} को {club} में — «{series}» में अपनी जगह बनाए रखें',
    'series.actionImIn': 'मैं आऊँगा',
    'series.actionNotThisTime': 'इस बार नहीं',
    'series.seatKept': 'जगह सुरक्षित रखी गई',
    'series.seatReleased': 'ठीक है — आपकी जगह दूसरों के लिए खुल जाएगी',
    'series.promptExpired': 'यह गेम अब खुला नहीं है',
  },
  th: {
    'series.nextWeekTitle': 'สัปดาห์หน้าเวลาเดิมไหม',
    'series.nextWeekBody': '{when} — เก็บที่นั่งของคุณไว้ใน "{series}"',
    'series.nextWeekBodyAtClub': '{when} ที่ {club} — เก็บที่นั่งของคุณไว้ใน "{series}"',
    'series.actionImIn': 'ฉันไป',
    'series.actionNotThisTime': 'ครั้งนี้ไม่',
    'series.seatKept': 'เก็บที่นั่งไว้แล้ว',
    'series.seatReleased': 'รับทราบ — ที่นั่งของคุณจะเปิดให้คนอื่น',
    'series.promptExpired': 'เกมนี้ไม่เปิดแล้ว',
  },
  ja: {
    'series.nextWeekTitle': '来週も同じ時間にどうですか？',
    'series.nextWeekBody': '{when} — 「{series}」の枠をキープしましょう',
    'series.nextWeekBodyAtClub': '{when}、{club} — 「{series}」の枠をキープしましょう',
    'series.actionImIn': '参加します',
    'series.actionNotThisTime': '今回はやめておく',
    'series.seatKept': '枠をキープしました',
    'series.seatReleased': '了解しました — あなたの枠は他の人に開放されます',
    'series.promptExpired': 'このゲームはもう受け付けていません',
  },
};

/** `t(key, lang)` for the series namespace. Unknown language falls back to `en`. */
export function seriesT(
  key: SeriesCopyKey,
  language: string | null | undefined,
  params: Record<string, string> = {},
): string {
  const lang = language && SERIES_COPY[language] ? language : 'en';
  const template = SERIES_COPY[lang][key] ?? SERIES_COPY.en[key] ?? key;
  return Object.entries(params).reduce(
    (acc, [name, value]) => acc.split(`{${name}}`).join(value),
    template,
  );
}

export const SERIES_COPY_LANGUAGES = Object.keys(SERIES_COPY);
