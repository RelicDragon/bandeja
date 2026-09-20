import { NotificationType, type NotificationPayload } from '../../types/notifications.types';
import { resolveRecapImageLanguage } from './recapCopy';

/**
 * PRD 353 — "Your September recap is ready ✨".
 *
 * Kept apart from `recapNotification.ts` on purpose: that module pulls in the
 * whole notification stack (Prisma, the Telegram bot, the push providers), and
 * this is pure copy that a unit test should be able to read on its own.
 */

const TITLE: Record<string, string> = {
  en: 'Your {{month}} recap is ready ✨',
  ru: 'Итоги {{month}} готовы ✨',
  sr: 'Tvoj rezime za {{month}} je spreman ✨',
  es: 'Tu resumen de {{month}} está listo ✨',
  cs: 'Tvůj přehled za {{month}} je hotový ✨',
  ar: 'ملخّصك لشهر {{month}} جاهز ✨',
  zh: '你的 {{month}} 回顾已生成 ✨',
  id: 'Rekap {{month}} kamu sudah siap ✨',
  hi: '{{month}} का आपका रीकैप तैयार है ✨',
  th: 'สรุปเดือน {{month}} ของคุณพร้อมแล้ว ✨',
  ja: '{{month}} の振り返りができました ✨',
};

const BODY: Record<string, string> = {
  en: 'Games, wins and your best partner — tap to watch.',
  ru: 'Игры, победы и лучший партнёр — нажми, чтобы посмотреть.',
  sr: 'Mečevi, pobede i najbolji partner — dodirni da pogledaš.',
  es: 'Partidos, victorias y tu mejor compañero: toca para verlo.',
  cs: 'Zápasy, výhry a tvůj nejlepší parťák — klepni a podívej se.',
  ar: 'المباريات والانتصارات وأفضل شريك لك — اضغط للمشاهدة.',
  zh: '比赛、胜场和你的最佳搭档，点击查看。',
  id: 'Pertandingan, kemenangan, dan partner terbaikmu — ketuk untuk melihat.',
  hi: 'मैच, जीत और आपका सर्वश्रेष्ठ साथी — देखने के लिए टैप करें।',
  th: 'แมตช์ ชัยชนะ และคู่หูยอดเยี่ยมของคุณ — แตะเพื่อดู',
  ja: '試合数、勝利数、ベストパートナー。タップして振り返りましょう。',
};

/** Exported so a test can assert the copy tables cover every app language. */
export const RECAP_PUSH_LANGUAGES = Object.keys(TITLE);

export function buildMonthlyRecapPushPayload(options: {
  monthKey: string;
  monthStart: string;
  language: string | null;
}): NotificationPayload {
  const language = resolveRecapImageLanguage(options.language);
  // Never a hard-coded month name — `Intl` produces it in the user's language.
  const month = new Intl.DateTimeFormat(language, {
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(options.monthStart));

  return {
    type: NotificationType.MONTHLY_RECAP_READY,
    title: (TITLE[language] ?? TITLE.en).replace('{{month}}', month),
    body: BODY[language] ?? BODY.en,
    data: { recapMonthKey: options.monthKey },
    sound: 'default',
  };
}
