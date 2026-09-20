import type { PriceCurrency } from '@prisma/client';

/**
 * PRD 348 — push / Telegram copy for `GAME_COST_REMINDER`, in the 11 app
 * languages.
 *
 * Kept next to the feature instead of in `utils/translations.ts`: that file is a
 * single 3.6k-line map that every concurrent feature branch edits, and these two
 * strings have no other consumer. `t()` semantics are the same — unknown
 * languages fall back to English.
 *
 * Amounts are formatted with `Intl.NumberFormat` in the recipient's language and
 * the game's own currency. A currency symbol is never concatenated by hand.
 */

export const COST_REMINDER_LANGUAGES = [
  'en', 'ru', 'sr', 'es', 'cs', 'ar', 'zh', 'id', 'hi', 'th', 'ja',
] as const;

export type CostReminderLanguage = (typeof COST_REMINDER_LANGUAGES)[number];

type CostReminderCopy = {
  title: string;
  /** `{{amount}}`, `{{name}}`, `{{game}}` */
  body: string;
};

const COPY: Record<CostReminderLanguage, CostReminderCopy> = {
  en: {
    title: 'Settle your share',
    body: '{{amount}} to {{name}} for {{game}}. Tap to settle.',
  },
  ru: {
    title: 'Рассчитайтесь за игру',
    body: '{{amount}} для {{name}} за игру «{{game}}». Нажмите, чтобы рассчитаться.',
  },
  sr: {
    title: 'Izmirite svoj deo',
    body: '{{amount}} za {{name}} za termin „{{game}}“. Dodirnite da izmirite.',
  },
  es: {
    title: 'Salda tu parte',
    body: '{{amount}} para {{name}} por «{{game}}». Toca para saldar.',
  },
  cs: {
    title: 'Vyrovnejte svůj podíl',
    body: '{{amount}} pro {{name}} za hru „{{game}}“. Klepnutím vyrovnáte.',
  },
  ar: {
    title: 'سدّد حصتك',
    body: '{{amount}} إلى {{name}} مقابل «{{game}}». اضغط للتسديد.',
  },
  zh: {
    title: '结清你的分摊',
    body: '需向 {{name}} 支付 {{amount}}，用于「{{game}}」。点击结清。',
  },
  id: {
    title: 'Lunasi bagianmu',
    body: '{{amount}} untuk {{name}} atas "{{game}}". Ketuk untuk melunasi.',
  },
  hi: {
    title: 'अपना हिस्सा चुकाएँ',
    body: '{{game}} के लिए {{name}} को {{amount}}। चुकाने के लिए टैप करें।',
  },
  th: {
    title: 'ชำระส่วนของคุณ',
    body: '{{amount}} ให้ {{name}} สำหรับ "{{game}}" แตะเพื่อชำระ',
  },
  ja: {
    title: '割り勘分を精算',
    body: '「{{game}}」の {{name}} さんへ {{amount}}。タップして精算。',
  },
};

export function resolveCostReminderLanguage(
  language: string | null | undefined,
): CostReminderLanguage {
  const normalized = (language ?? '').slice(0, 2).toLowerCase();
  return (COST_REMINDER_LANGUAGES as readonly string[]).includes(normalized)
    ? (normalized as CostReminderLanguage)
    : 'en';
}

/** Minor units per one major unit — mirrors `costShareMath.currencyMinorFactor`. */
function minorFactor(currency: PriceCurrency): number {
  if (currency === 'JPY' || currency === 'KRW' || currency === 'IDR') return 1;
  if (currency === 'KWD' || currency === 'OMR') return 1000;
  return 100;
}

export function formatCostAmount(
  amountMinor: number,
  currency: PriceCurrency,
  language: string,
): string {
  const factor = minorFactor(currency);
  const value = amountMinor / factor;
  const fractionDigits = factor === 1 ? 0 : factor === 1000 ? 3 : 2;
  try {
    return new Intl.NumberFormat(language, {
      style: 'currency',
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(value);
  } catch {
    return `${value.toFixed(fractionDigits)} ${currency}`;
  }
}

export function buildCostReminderCopy(input: {
  language: string | null | undefined;
  amountMinor: number;
  currency: PriceCurrency;
  payerName: string;
  gameName: string;
}): { title: string; body: string } {
  const language = resolveCostReminderLanguage(input.language);
  const copy = COPY[language];
  const amount = formatCostAmount(input.amountMinor, input.currency, language);
  return {
    title: copy.title,
    body: interpolateCostCopy(copy.body, {
      amount,
      name: input.payerName,
      game: input.gameName,
    }),
  };
}

const COST_COPY_PLACEHOLDER = /\{\{(amount|name|game)\}\}/g;

/**
 * `String.prototype.replace` with a **string** replacement interprets `$$`,
 * `$&`, `` $` `` and `$'` — and `name` / `game` are user-supplied, so a player
 * called `$&` rewrote the push body. A function replacement takes the value
 * literally. Global, too: a translation that repeats a placeholder would
 * otherwise keep the second copy raw.
 */
function interpolateCostCopy(
  template: string,
  values: Record<'amount' | 'name' | 'game', string>,
): string {
  return template.replace(
    COST_COPY_PLACEHOLDER,
    (_match, key: 'amount' | 'name' | 'game') => values[key],
  );
}
