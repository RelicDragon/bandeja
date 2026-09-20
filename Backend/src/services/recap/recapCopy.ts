/**
 * PRD 353 — copy for the **server-rendered** recap images only.
 *
 * The in-app viewer never reads this: it renders from the language-free payload
 * with the `recap` i18n namespace. But a shared recap becomes a flat PNG in a
 * follower's story rail, and a `recap-card` export becomes a PNG in someone's
 * camera roll — both are baked at render time and must already be in the
 * author's language.
 *
 * This lives here rather than in `utils/translations.ts` on purpose: that file
 * is a 4 000-line shared surface and these ten strings are only ever used by
 * one renderer.
 */

export const RECAP_IMAGE_LANGUAGES = [
  'en',
  'ru',
  'sr',
  'es',
  'cs',
  'ar',
  'zh',
  'id',
  'hi',
  'th',
  'ja',
] as const;

export type RecapImageLanguage = (typeof RECAP_IMAGE_LANGUAGES)[number];

export type RecapCopyKey =
  | 'coverTitle'
  | 'games'
  | 'wins'
  | 'winRate'
  | 'level'
  | 'partner'
  | 'streak'
  | 'streakUnit'
  | 'club'
  | 'outro'
  | 'lowActivity'
  | 'summaryTitle';

type RecapCopyTable = Record<RecapCopyKey, string>;

const COPY: Record<RecapImageLanguage, RecapCopyTable> = {
  en: {
    coverTitle: 'in numbers',
    games: 'Games',
    wins: 'Wins',
    winRate: 'Win rate',
    level: 'Level',
    partner: 'Best partner',
    streak: 'Play streak',
    streakUnit: 'weeks',
    club: 'Home court',
    outro: 'See you on court',
    summaryTitle: 'My month',
    lowActivity: 'Back on court soon',
  },
  ru: {
    coverTitle: 'в цифрах',
    games: 'Игры',
    wins: 'Победы',
    winRate: 'Процент побед',
    level: 'Уровень',
    partner: 'Лучший партнёр',
    streak: 'Серия игр',
    streakUnit: 'недель',
    club: 'Любимый клуб',
    outro: 'До встречи на корте',
    summaryTitle: 'Мой месяц',
    lowActivity: 'Скоро снова на корт',
  },
  sr: {
    coverTitle: 'u brojkama',
    games: 'Mečevi',
    wins: 'Pobede',
    winRate: 'Procenat pobeda',
    level: 'Nivo',
    partner: 'Najbolji partner',
    streak: 'Niz nedelja',
    streakUnit: 'nedelja',
    club: 'Omiljeni klub',
    outro: 'Vidimo se na terenu',
    summaryTitle: 'Moj mesec',
    lowActivity: 'Uskoro ponovo na teren',
  },
  es: {
    coverTitle: 'en números',
    games: 'Partidos',
    wins: 'Victorias',
    winRate: 'Ratio de victorias',
    level: 'Nivel',
    partner: 'Mejor compañero',
    streak: 'Racha de juego',
    streakUnit: 'semanas',
    club: 'Club habitual',
    outro: 'Nos vemos en la pista',
    summaryTitle: 'Mi mes',
    lowActivity: 'Vuelve pronto a la pista',
  },
  cs: {
    coverTitle: 'v číslech',
    games: 'Zápasy',
    wins: 'Výhry',
    winRate: 'Úspěšnost',
    level: 'Úroveň',
    partner: 'Nejlepší parťák',
    streak: 'Série týdnů',
    streakUnit: 'týdnů',
    club: 'Domácí klub',
    outro: 'Uvidíme se na kurtu',
    summaryTitle: 'Můj měsíc',
    lowActivity: 'Brzy zase na kurt',
  },
  ar: {
    coverTitle: 'بالأرقام',
    games: 'المباريات',
    wins: 'الانتصارات',
    winRate: 'نسبة الفوز',
    level: 'المستوى',
    partner: 'أفضل شريك',
    streak: 'سلسلة اللعب',
    streakUnit: 'أسابيع',
    club: 'الملعب المفضل',
    outro: 'نراك في الملعب',
    summaryTitle: 'شهري',
    lowActivity: 'عُد إلى الملعب قريبًا',
  },
  zh: {
    coverTitle: '数据回顾',
    games: '比赛场次',
    wins: '胜场',
    winRate: '胜率',
    level: '等级',
    partner: '最佳搭档',
    streak: '连续周数',
    streakUnit: '周',
    club: '常去球馆',
    outro: '球场再见',
    summaryTitle: '我的这个月',
    lowActivity: '期待你早日回到球场',
  },
  id: {
    coverTitle: 'dalam angka',
    games: 'Pertandingan',
    wins: 'Kemenangan',
    winRate: 'Rasio menang',
    level: 'Level',
    partner: 'Partner terbaik',
    streak: 'Rentetan main',
    streakUnit: 'minggu',
    club: 'Klub favorit',
    outro: 'Sampai jumpa di lapangan',
    summaryTitle: 'Bulanku',
    lowActivity: 'Sampai jumpa lagi di lapangan',
  },
  hi: {
    coverTitle: 'आंकड़ों में',
    games: 'मैच',
    wins: 'जीत',
    winRate: 'जीत दर',
    level: 'स्तर',
    partner: 'सर्वश्रेष्ठ साथी',
    streak: 'लगातार खेल',
    streakUnit: 'सप्ताह',
    club: 'पसंदीदा क्लब',
    outro: 'कोर्ट पर मिलते हैं',
    summaryTitle: 'मेरा महीना',
    lowActivity: 'जल्द ही कोर्ट पर लौटें',
  },
  th: {
    coverTitle: 'สรุปเป็นตัวเลข',
    games: 'จำนวนแมตช์',
    wins: 'ชนะ',
    winRate: 'อัตราชนะ',
    level: 'ระดับ',
    partner: 'คู่หูยอดเยี่ยม',
    streak: 'สถิติเล่นต่อเนื่อง',
    streakUnit: 'สัปดาห์',
    club: 'คลับประจำ',
    outro: 'เจอกันที่คอร์ต',
    summaryTitle: 'เดือนของฉัน',
    lowActivity: 'กลับมาที่คอร์ตเร็ว ๆ นี้',
  },
  ja: {
    coverTitle: 'を数字で振り返る',
    games: '試合数',
    wins: '勝利数',
    winRate: '勝率',
    level: 'レベル',
    partner: 'ベストパートナー',
    streak: '連続週数',
    streakUnit: '週',
    club: 'よく行くクラブ',
    outro: 'コートで会いましょう',
    summaryTitle: '今月の記録',
    lowActivity: 'またコートで待っています',
  },
};

export function isRecapImageLanguage(value: unknown): value is RecapImageLanguage {
  return (
    typeof value === 'string' && (RECAP_IMAGE_LANGUAGES as readonly string[]).includes(value)
  );
}

export function resolveRecapImageLanguage(language: string | null | undefined): RecapImageLanguage {
  const base = language?.split('-')[0]?.toLowerCase();
  return isRecapImageLanguage(base) ? base : 'en';
}

export function recapCopy(language: RecapImageLanguage, key: RecapCopyKey): string {
  return COPY[language][key];
}

/** `ar` is the only RTL locale in the app; the rendered slides mirror with it. */
export function isRecapRtlLanguage(language: RecapImageLanguage): boolean {
  return language === 'ar';
}
