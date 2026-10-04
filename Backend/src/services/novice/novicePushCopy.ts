/**
 * Novice mode (PRD #358) — "Your results are in — you reached <Rank>".
 *
 * Pure copy (no Prisma / push stack) so a unit test can check it covers every
 * app language. Rank names match the order of `NOVICE_RANK_IDS`.
 */
import { NOVICE_RANK_IDS, noviceRankId, type NoviceRankId } from '@bandeja/shared/novice';
import { NotificationType, type NotificationPayload } from '../../types/notifications.types';

const RANK_NAMES: Record<string, readonly string[]> = {
  en: ['Newcomer', 'Debut', 'Rookie', 'Contender', 'Challenger', 'Regular'],
  ru: ['Новичок', 'Дебютант', 'Новобранец', 'Претендент', 'Челленджер', 'Завсегдатай'],
  sr: ['Novajlija', 'Debitant', 'Početnik', 'Kandidat', 'Izazivač', 'Redovni'],
  es: ['Novato', 'Debutante', 'Aprendiz', 'Aspirante', 'Retador', 'Habitual'],
  cs: ['Nováček', 'Debutant', 'Začátečník', 'Uchazeč', 'Vyzyvatel', 'Stálice'],
  ar: ['مبتدئ', 'الظهور الأول', 'ناشئ', 'منافس', 'متحدٍّ', 'منتظم'],
  zh: ['新人', '首秀', '新秀', '竞争者', '挑战者', '常客'],
  id: ['Pendatang Baru', 'Debut', 'Pemula', 'Pesaing', 'Penantang', 'Reguler'],
  hi: ['नवागंतुक', 'डेब्यू', 'रूकी', 'दावेदार', 'चैलेंजर', 'रेगुलर'],
  th: ['มือใหม่', 'เดบิวต์', 'รุกกี้', 'ผู้ท้าชิง', 'ผู้ท้าทาย', 'ขาประจำ'],
  ja: ['ニューカマー', 'デビュー', 'ルーキー', 'コンテンダー', 'チャレンジャー', 'レギュラー'],
};

const TITLE: Record<string, string> = {
  en: 'Your results are in',
  ru: 'Результаты готовы',
  sr: 'Rezultati su tu',
  es: 'Ya tienes tus resultados',
  cs: 'Výsledky jsou tady',
  ar: 'نتائجك جاهزة',
  zh: '你的成绩出来了',
  id: 'Hasilmu sudah keluar',
  hi: 'आपके नतीजे आ गए',
  th: 'ผลของคุณออกแล้ว',
  ja: '結果が出ました',
};

const BODY: Record<string, string> = {
  en: 'You reached {{rank}}. Tap to see what’s new.',
  ru: 'Ты достиг ранга «{{rank}}». Нажми, чтобы посмотреть, что открылось.',
  sr: 'Dostigao si rang {{rank}}. Dodirni da vidiš šta je novo.',
  es: 'Alcanzaste el rango {{rank}}. Toca para ver las novedades.',
  cs: 'Dosáhl jsi hodnosti {{rank}}. Klepni a podívej se, co je nového.',
  ar: 'وصلت إلى رتبة {{rank}}. اضغط لترى الجديد.',
  zh: '你已升至「{{rank}}」，点击查看新内容。',
  id: 'Kamu mencapai peringkat {{rank}}. Ketuk untuk melihat yang baru.',
  hi: 'आप {{rank}} रैंक पर पहुँच गए। नया क्या है देखने के लिए टैप करें।',
  th: 'คุณขึ้นเป็น {{rank}} แล้ว แตะเพื่อดูสิ่งใหม่',
  ja: '{{rank}} に到達しました。タップして新機能をチェック。',
};

/** Exported so a test can assert every table covers every app language. */
export const NOVICE_PUSH_LANGUAGES = Object.keys(TITLE);

export function resolveNovicePushLanguage(language: string | null | undefined): string {
  const base = (language ?? '').trim().toLowerCase().split(/[-_]/)[0];
  return base && TITLE[base] ? base : 'en';
}

export function noviceRankName(rank: number | NoviceRankId, language: string): string {
  const id = typeof rank === 'number' ? noviceRankId(rank) : rank;
  const names = RANK_NAMES[resolveNovicePushLanguage(language)] ?? RANK_NAMES.en;
  return names[NOVICE_RANK_IDS.indexOf(id)] ?? RANK_NAMES.en[NOVICE_RANK_IDS.indexOf(id)];
}

export function buildNoviceRankUpPushPayload(options: {
  rank: number;
  language: string | null | undefined;
}): NotificationPayload {
  const language = resolveNovicePushLanguage(options.language);
  return {
    type: NotificationType.NOVICE_RANK_UP,
    title: TITLE[language] ?? TITLE.en,
    body: (BODY[language] ?? BODY.en).replace('{{rank}}', noviceRankName(options.rank, language)),
    data: { noviceRank: String(options.rank) },
    sound: 'default',
  };
}

export const NOVICE_RANK_NAME_TABLE: Readonly<Record<string, readonly string[]>> = RANK_NAMES;
export const NOVICE_PUSH_BODY_TABLE: Readonly<Record<string, string>> = BODY;
