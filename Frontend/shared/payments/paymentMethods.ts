/**
 * PRD 348 — the catalogue of *how to pay the organiser back*.
 *
 * The cost split never moves real money: the app only records who paid. What it
 * can do is tell a player **where to send it**, and that answer is local. A
 * Spaniard sends a Bizum to a phone number, a Serb uses IPS Prenesi, a
 * Brazilian pastes a Pix key, and none of them has ever typed an IBAN to split
 * a court. Offering the whole list everywhere made the field noise; offering
 * only IBAN/Revolut made it wrong outside western Europe.
 *
 * So every method declares the countries it exists in, and the picker shows the
 * intersection with the country the game is played in. Two rules hold
 * everywhere:
 *
 * 1. {@link CUSTOM_PAYMENT_METHOD_ID} is always first — free text is the escape
 *    hatch when the catalogue is wrong, and it is what the pre-catalogue
 *    `Game.paymentHint` free-text field becomes.
 * 2. `CASH` and `BANK_TRANSFER` are always last and always available — the two
 *    answers that work in every country on earth.
 *
 * Nothing here is a payment integration. A handle is a string the payer reads,
 * copies, or opens in the provider's own app; the server never validates it
 * against a bank, never stores a card, and never contacts a provider.
 */

import { resolveCountryIso2 } from '../geo/countryIso2';

/** What the payer has to type for this method, and how the field behaves. */
export type PaymentHandleKind =
  /** Nothing to enter — "cash at the club". */
  | 'NONE'
  /** Anything at all. The catalogue's escape hatch. */
  | 'TEXT'
  | 'PHONE'
  | 'EMAIL'
  | 'PHONE_OR_EMAIL'
  /** `@username`, a `$cashtag`, a Mercado Pago alias. */
  | 'TAG'
  | 'IBAN'
  /** A domestic account number (Serbian tekući račun, Mexican CLABE, UK sort code + number). */
  | 'ACCOUNT'
  /** A bank card number, still the normal P2P rail in UA / RU / BY / KZ. */
  | 'CARD'
  /** A provider alias that may be a phone, an email or a national id (Pix key, UPI id, PromptPay). */
  | 'ALIAS';

export interface PaymentHandleRules {
  /** Hard cap; also the `maxLength` on the input. */
  maxLength: number;
  /** `inputMode` for the mobile keyboard. */
  inputMode: 'text' | 'tel' | 'email' | 'numeric';
  /** Characters allowed after trimming. Applied to the whole handle. */
  pattern?: RegExp;
  /**
   * The input's placeholder — a shape hint, not prose.
   *
   * Deliberately **not** an i18n string. `ES91 2100 0418 4502 0005 1332` is an
   * IBAN in every language, and translating `you@example.com` eleven times
   * produces eleven identical strings that a locale-parity check then has to
   * be told to ignore. The field's *label* is translated; its example is data,
   * and data belongs next to the format rules that describe it.
   */
  example: string;
}

export const PAYMENT_HANDLE_RULES: Record<PaymentHandleKind, PaymentHandleRules> = {
  NONE: { maxLength: 0, inputMode: 'text', example: '' },
  TEXT: { maxLength: 120, inputMode: 'text', example: '' },
  PHONE: {
    maxLength: 24,
    inputMode: 'tel',
    pattern: /^\+?[0-9 ()./-]{5,24}$/,
    example: '+34 600 11 22 33',
  },
  EMAIL: {
    maxLength: 96,
    inputMode: 'email',
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    example: 'you@example.com',
  },
  PHONE_OR_EMAIL: { maxLength: 96, inputMode: 'text', example: '+34 600 11 22 33' },
  TAG: {
    maxLength: 48,
    inputMode: 'text',
    pattern: /^[@$]?[A-Za-z0-9._-]{2,47}$/,
    example: '@yourname',
  },
  IBAN: {
    maxLength: 42,
    inputMode: 'text',
    pattern: /^[A-Za-z]{2}[0-9]{2}[A-Za-z0-9 ]{8,38}$/,
    example: 'ES91 2100 0418 4502 0005 1332',
  },
  ACCOUNT: {
    maxLength: 48,
    inputMode: 'text',
    pattern: /^[A-Za-z0-9 ./-]{4,48}$/,
    example: '160-0000123456789-12',
  },
  CARD: { maxLength: 32, inputMode: 'numeric', pattern: /^[0-9 ]{12,32}$/, example: '5375 4141 0000 0000' },
  ALIAS: { maxLength: 96, inputMode: 'text', example: '' },
};

/** Where a method can be offered. */
export type PaymentMethodAvailability =
  /** Offered in every country — only `CUSTOM`, `CASH` and `BANK_TRANSFER`. */
  | { scope: 'GLOBAL' }
  | { scope: 'COUNTRIES'; countries: readonly string[] };

export interface PaymentMethodDef {
  id: string;
  /**
   * Brand name, shown verbatim in every locale. Bizum is Bizum in Arabic too —
   * translating a brand only makes it unsearchable.
   */
  brand: string | null;
  /**
   * i18n key under `cost.payment.method.*`, for the generic methods that have
   * no brand (`CUSTOM`, `CASH`, `BANK_TRANSFER`, `IBAN`, `CARD_TRANSFER`).
   * Exactly one of `brand` / `labelKey` is set.
   */
  labelKey?: string;
  handle: PaymentHandleKind;
  availability: PaymentMethodAvailability;
  /** Lower sorts first inside a country's list. */
  rank: number;
  /**
   * Per-country override of {@link rank}. Revolut is *the* way to split a bill
   * in Ireland and a curiosity in Austria; PayPal is the default in Germany and
   * an afterthought in Spain.
   */
  rankByCountry?: Readonly<Record<string, number>>;
  /**
   * Deep link opened by the "Open" button in the settle sheet. `{handle}` is
   * replaced with the URL-encoded handle. Absent when the provider has no
   * addressable link (Bizum, Prenesi, PayNow … are phone-number rails inside
   * the payer's own banking app).
   */
  linkTemplate?: string;
}

export const CUSTOM_PAYMENT_METHOD_ID = 'CUSTOM';

/** Rank bands, so a new entry lands in the right place without re-numbering. */
const RANK = {
  /** Free text — pinned above everything. */
  custom: 0,
  /** The one rail locals actually use (Bizum, Pix, Prenesi, Swish …). */
  domestic: 10,
  /** A second, still-popular domestic wallet. */
  domesticAlt: 20,
  /** Domestic bank rails: IBAN, account number, card-to-card. */
  bank: 40,
  /** Cross-border wallets: Revolut, PayPal, Wise. */
  wallet: 60,
  /** The two universal fallbacks. */
  fallback: 90,
  cash: 99,
} as const;

/**
 * IBAN countries — SEPA plus the non-SEPA states where an IBAN is genuinely how
 * a local asks to be paid (Türkiye, the Gulf).
 *
 * Deliberately **excludes** the western Balkans: Serbia, Bosnia, North
 * Macedonia and Albania have IBANs on paper, but a domestic transfer there is
 * addressed by account number or phone, and nobody splits a padel court by
 * IBAN. Those countries get `BANK_TRANSFER` (and, for Serbia, IPS Prenesi)
 * instead. Montenegro is in because it is euroised and IBAN-native.
 */
const IBAN_COUNTRIES = [
  'AD', 'AT', 'BE', 'BG', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR',
  'GB', 'GI', 'GR', 'HR', 'HU', 'IE', 'IS', 'IT', 'LI', 'LT', 'LU', 'LV', 'MC',
  'MD', 'ME', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'SM', 'VA',
  // Non-SEPA, IBAN-native in daily use.
  'TR', 'AE', 'SA', 'QA', 'KW', 'OM', 'BH',
] as const;

/** Countries where Revolut is licensed and a plausible way to be paid back. */
const REVOLUT_COUNTRIES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IS', 'IE', 'IT', 'LV', 'LI', 'LT', 'LU', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO',
  'SK', 'SI', 'ES', 'SE', 'CH', 'GB', 'AU', 'NZ', 'SG', 'JP', 'US', 'BR', 'MX',
] as const;

/**
 * Countries where PayPal can *receive* a personal payment.
 *
 * Excludes Türkiye (PayPal left the market in 2016) and India (the domestic
 * business closed in 2021), which are exactly the markets where leaving it in
 * would send a player to a dead end.
 */
const PAYPAL_COUNTRIES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SK', 'SI',
  'ES', 'SE', 'CH', 'GB', 'RS', 'ME', 'IL', 'AE', 'SA', 'ZA',
  'US', 'CA', 'MX', 'BR', 'AR', 'CL', 'CO', 'PE', 'AU', 'NZ', 'SG', 'HK', 'JP',
] as const;

/** Cross-border, and the usual answer when the payer is not in the game's country. */
const WISE_COUNTRIES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SK', 'SI',
  'ES', 'SE', 'CH', 'GB', 'TR', 'AE', 'IL', 'US', 'CA', 'AU', 'NZ', 'SG', 'JP',
  'MY', 'IN', 'BR', 'MX', 'ZA',
] as const;

/** Card-to-card by 16-digit PAN — the everyday P2P rail across the CIS. */
const CARD_TRANSFER_COUNTRIES = ['UA', 'RU', 'BY', 'KZ', 'MD', 'GE', 'AM', 'AZ', 'UZ', 'KG'] as const;

const definition = (def: PaymentMethodDef): PaymentMethodDef => def;

const inCountries = (countries: readonly string[]): PaymentMethodAvailability => ({
  scope: 'COUNTRIES',
  countries,
});

/**
 * The catalogue.
 *
 * Order in this array is irrelevant — {@link paymentMethodsForCountry} sorts by
 * rank. Group by region only to keep the file readable.
 */
export const PAYMENT_METHODS: readonly PaymentMethodDef[] = [
  // ── Universal ──────────────────────────────────────────────────────────────
  definition({
    id: CUSTOM_PAYMENT_METHOD_ID,
    brand: null,
    labelKey: 'custom',
    handle: 'TEXT',
    availability: { scope: 'GLOBAL' },
    rank: RANK.custom,
  }),
  definition({
    id: 'BANK_TRANSFER',
    brand: null,
    labelKey: 'bankTransfer',
    handle: 'ACCOUNT',
    availability: { scope: 'GLOBAL' },
    rank: RANK.fallback,
  }),
  definition({
    id: 'CASH',
    brand: null,
    labelKey: 'cash',
    handle: 'NONE',
    availability: { scope: 'GLOBAL' },
    rank: RANK.cash,
  }),

  // ── Cross-border rails ─────────────────────────────────────────────────────
  definition({
    id: 'IBAN',
    brand: null,
    labelKey: 'iban',
    handle: 'IBAN',
    availability: inCountries(IBAN_COUNTRIES),
    rank: RANK.bank,
  }),
  definition({
    id: 'REVOLUT',
    brand: 'Revolut',
    handle: 'TAG',
    availability: inCountries(REVOLUT_COUNTRIES),
    rank: RANK.wallet,
    // Where Revolut is the default way friends settle up, not a second account.
    rankByCountry: { IE: 5, RO: 6, LT: 8, BG: 12, MT: 12, CY: 12, PL: 25, GB: 25 },
    linkTemplate: 'https://revolut.me/{handle}',
  }),
  definition({
    id: 'PAYPAL',
    brand: 'PayPal',
    handle: 'TAG',
    availability: inCountries(PAYPAL_COUNTRIES),
    rank: RANK.wallet + 5,
    rankByCountry: { DE: 8, AT: 12, US: 25, GB: 30 },
    linkTemplate: 'https://paypal.me/{handle}',
  }),
  definition({
    id: 'WISE',
    brand: 'Wise',
    handle: 'TAG',
    availability: inCountries(WISE_COUNTRIES),
    rank: RANK.wallet + 10,
    linkTemplate: 'https://wise.com/pay/me/{handle}',
  }),
  definition({
    id: 'CARD_TRANSFER',
    brand: null,
    labelKey: 'cardTransfer',
    handle: 'CARD',
    availability: inCountries(CARD_TRANSFER_COUNTRIES),
    rank: RANK.bank,
  }),

  // ── Iberia ─────────────────────────────────────────────────────────────────
  definition({
    id: 'BIZUM',
    brand: 'Bizum',
    handle: 'PHONE',
    availability: inCountries(['ES']),
    rank: RANK.domestic,
  }),
  definition({
    id: 'MBWAY',
    brand: 'MB WAY',
    handle: 'PHONE',
    availability: inCountries(['PT']),
    rank: RANK.domestic,
  }),

  // ── Western Europe ─────────────────────────────────────────────────────────
  definition({
    id: 'SATISPAY',
    brand: 'Satispay',
    handle: 'PHONE',
    availability: inCountries(['IT', 'FR', 'DE', 'LU']),
    rank: RANK.domestic,
    rankByCountry: { FR: 30, DE: 30, LU: 30 },
  }),
  definition({
    id: 'BANCOMAT_PAY',
    brand: 'BANCOMAT Pay',
    handle: 'PHONE',
    availability: inCountries(['IT']),
    rank: RANK.domesticAlt,
  }),
  definition({
    id: 'LYDIA',
    brand: 'Lydia',
    handle: 'PHONE',
    availability: inCountries(['FR']),
    rank: RANK.domestic,
  }),
  definition({
    id: 'WERO',
    brand: 'Wero',
    handle: 'PHONE_OR_EMAIL',
    availability: inCountries(['FR', 'DE', 'BE', 'NL', 'LU']),
    rank: RANK.domestic + 2,
  }),
  definition({
    id: 'PAYCONIQ',
    brand: 'Payconiq',
    handle: 'PHONE',
    availability: inCountries(['BE', 'LU']),
    rank: RANK.domestic,
  }),
  definition({
    id: 'TIKKIE',
    brand: 'Tikkie',
    handle: 'PHONE',
    availability: inCountries(['NL']),
    rank: RANK.domestic,
  }),
  definition({
    id: 'TWINT',
    brand: 'TWINT',
    handle: 'PHONE',
    availability: inCountries(['CH', 'LI']),
    rank: RANK.domestic,
  }),
  definition({
    id: 'UK_BANK',
    brand: null,
    labelKey: 'ukBank',
    handle: 'ACCOUNT',
    availability: inCountries(['GB', 'GG']),
    rank: RANK.domestic,
  }),

  // ── Nordics ────────────────────────────────────────────────────────────────
  definition({
    id: 'SWISH',
    brand: 'Swish',
    handle: 'PHONE',
    availability: inCountries(['SE']),
    rank: RANK.domestic,
  }),
  definition({
    id: 'VIPPS',
    brand: 'Vipps',
    handle: 'PHONE',
    availability: inCountries(['NO']),
    rank: RANK.domestic,
  }),
  definition({
    id: 'MOBILEPAY',
    brand: 'MobilePay',
    handle: 'PHONE',
    availability: inCountries(['DK', 'FI']),
    rank: RANK.domestic,
  }),

  // ── Central Europe & Baltics ───────────────────────────────────────────────
  definition({
    id: 'BLIK',
    brand: 'BLIK',
    handle: 'PHONE',
    availability: inCountries(['PL']),
    rank: RANK.domestic,
  }),
  definition({
    id: 'HU_INSTANT',
    brand: null,
    labelKey: 'huInstant',
    handle: 'PHONE_OR_EMAIL',
    availability: inCountries(['HU']),
    rank: RANK.domestic,
  }),
  definition({
    id: 'PAYSERA',
    brand: 'Paysera',
    handle: 'EMAIL',
    availability: inCountries(['LT', 'LV', 'EE']),
    rank: RANK.domesticAlt,
  }),

  // ── Balkans ────────────────────────────────────────────────────────────────
  definition({
    // Serbia's instant payment scheme — pay a phone number from any Serbian
    // banking app. The one rail a Belgrade player will actually recognise.
    id: 'IPS_PRENESI',
    brand: 'IPS Prenesi',
    handle: 'PHONE',
    availability: inCountries(['RS']),
    rank: RANK.domestic,
  }),
  definition({
    id: 'RS_ACCOUNT',
    brand: null,
    labelKey: 'rsAccount',
    handle: 'ACCOUNT',
    availability: inCountries(['RS']),
    rank: RANK.domesticAlt,
  }),
  definition({
    id: 'KEKS_PAY',
    brand: 'KEKS Pay',
    handle: 'PHONE',
    availability: inCountries(['HR']),
    rank: RANK.domestic,
  }),
  definition({
    id: 'AIRCASH',
    brand: 'Aircash',
    handle: 'PHONE',
    availability: inCountries(['HR', 'SI', 'BA', 'RS', 'MK']),
    rank: RANK.domesticAlt,
  }),
  definition({
    id: 'FLIK',
    brand: 'Flik',
    handle: 'PHONE',
    availability: inCountries(['SI']),
    rank: RANK.domestic,
  }),

  // ── Greece & Cyprus ────────────────────────────────────────────────────────
  definition({
    id: 'IRIS',
    brand: 'IRIS',
    handle: 'PHONE',
    availability: inCountries(['GR']),
    rank: RANK.domestic,
  }),

  // ── Türkiye, Israel, CIS ───────────────────────────────────────────────────
  definition({
    id: 'PAPARA',
    brand: 'Papara',
    handle: 'TAG',
    availability: inCountries(['TR']),
    rank: RANK.domesticAlt,
  }),
  definition({
    id: 'BIT',
    brand: 'Bit',
    handle: 'PHONE',
    availability: inCountries(['IL']),
    rank: RANK.domestic,
  }),
  definition({
    id: 'PAYBOX',
    brand: 'PayBox',
    handle: 'PHONE',
    availability: inCountries(['IL']),
    rank: RANK.domesticAlt,
  }),
  definition({
    id: 'MONOBANK',
    brand: 'monobank',
    handle: 'TEXT',
    availability: inCountries(['UA']),
    rank: RANK.domestic,
  }),
  definition({
    id: 'SBP',
    brand: 'СБП',
    handle: 'PHONE',
    availability: inCountries(['RU']),
    rank: RANK.domestic,
  }),
  definition({
    id: 'KASPI',
    brand: 'Kaspi',
    handle: 'PHONE',
    availability: inCountries(['KZ']),
    rank: RANK.domestic,
  }),

  // ── Gulf ───────────────────────────────────────────────────────────────────
  definition({
    id: 'AANI',
    brand: 'Aani',
    handle: 'PHONE',
    availability: inCountries(['AE']),
    rank: RANK.domestic,
  }),
  definition({
    id: 'STC_PAY',
    brand: 'stc pay',
    handle: 'PHONE',
    availability: inCountries(['SA']),
    rank: RANK.domestic,
  }),
  definition({
    id: 'FAWRAN',
    brand: 'Fawran',
    handle: 'PHONE',
    availability: inCountries(['QA']),
    rank: RANK.domestic,
  }),
  definition({
    id: 'BENEFIT_PAY',
    brand: 'BenefitPay',
    handle: 'PHONE',
    availability: inCountries(['BH']),
    rank: RANK.domestic,
  }),

  // ── South & South-East Asia ────────────────────────────────────────────────
  definition({
    id: 'UPI',
    brand: 'UPI',
    handle: 'ALIAS',
    availability: inCountries(['IN']),
    rank: RANK.domestic,
    linkTemplate: 'upi://pay?pa={handle}',
  }),
  definition({
    id: 'PROMPTPAY',
    brand: 'PromptPay',
    handle: 'ALIAS',
    availability: inCountries(['TH']),
    rank: RANK.domestic,
  }),
  definition({
    id: 'PAYNOW',
    brand: 'PayNow',
    handle: 'PHONE',
    availability: inCountries(['SG']),
    rank: RANK.domestic,
  }),
  definition({
    id: 'DUITNOW',
    brand: 'DuitNow',
    handle: 'ALIAS',
    availability: inCountries(['MY']),
    rank: RANK.domestic,
  }),
  definition({
    id: 'TOUCH_N_GO',
    brand: "Touch 'n Go eWallet",
    handle: 'PHONE',
    availability: inCountries(['MY']),
    rank: RANK.domesticAlt,
  }),
  definition({
    id: 'GOPAY',
    brand: 'GoPay',
    handle: 'PHONE',
    availability: inCountries(['ID']),
    rank: RANK.domestic,
  }),
  definition({
    id: 'DANA',
    brand: 'DANA',
    handle: 'PHONE',
    availability: inCountries(['ID']),
    rank: RANK.domesticAlt,
  }),
  definition({
    id: 'OVO',
    brand: 'OVO',
    handle: 'PHONE',
    availability: inCountries(['ID']),
    rank: RANK.domesticAlt + 2,
  }),
  definition({
    id: 'GCASH',
    brand: 'GCash',
    handle: 'PHONE',
    availability: inCountries(['PH']),
    rank: RANK.domestic,
  }),
  definition({
    id: 'MAYA',
    brand: 'Maya',
    handle: 'PHONE',
    availability: inCountries(['PH']),
    rank: RANK.domesticAlt,
  }),

  // ── East Asia & Pacific ────────────────────────────────────────────────────
  definition({
    id: 'PAYPAY',
    brand: 'PayPay',
    handle: 'ALIAS',
    availability: inCountries(['JP']),
    rank: RANK.domestic,
  }),
  definition({
    id: 'KAKAO_PAY',
    brand: 'KakaoPay',
    handle: 'PHONE',
    availability: inCountries(['KR']),
    rank: RANK.domestic,
  }),
  definition({
    id: 'TOSS',
    brand: 'Toss',
    handle: 'PHONE',
    availability: inCountries(['KR']),
    rank: RANK.domesticAlt,
  }),
  definition({
    id: 'FPS',
    brand: 'FPS',
    handle: 'ALIAS',
    availability: inCountries(['HK']),
    rank: RANK.domestic,
  }),
  definition({
    id: 'PAYME',
    brand: 'PayMe',
    handle: 'PHONE',
    availability: inCountries(['HK']),
    rank: RANK.domesticAlt,
  }),
  definition({
    id: 'WECHAT_PAY',
    brand: 'WeChat Pay',
    handle: 'ALIAS',
    availability: inCountries(['CN']),
    rank: RANK.domestic,
  }),
  definition({
    id: 'ALIPAY',
    brand: 'Alipay',
    handle: 'ALIAS',
    availability: inCountries(['CN']),
    rank: RANK.domesticAlt,
  }),
  definition({
    id: 'PAYID',
    brand: 'PayID',
    handle: 'PHONE_OR_EMAIL',
    availability: inCountries(['AU']),
    rank: RANK.domestic,
  }),

  // ── North America ──────────────────────────────────────────────────────────
  definition({
    id: 'VENMO',
    brand: 'Venmo',
    handle: 'TAG',
    availability: inCountries(['US']),
    rank: RANK.domestic,
    linkTemplate: 'https://venmo.com/u/{handle}',
  }),
  definition({
    id: 'ZELLE',
    brand: 'Zelle',
    handle: 'PHONE_OR_EMAIL',
    availability: inCountries(['US']),
    rank: RANK.domesticAlt,
  }),
  definition({
    id: 'CASH_APP',
    brand: 'Cash App',
    handle: 'TAG',
    availability: inCountries(['US', 'GB']),
    rank: RANK.domesticAlt + 2,
    rankByCountry: { GB: 50 },
    // The `$` is part of a cashtag URL; `{handle}` is substituted after it.
    linkTemplate: 'https://cash.app/${handle}',
  }),
  definition({
    id: 'INTERAC',
    brand: 'Interac e-Transfer',
    handle: 'PHONE_OR_EMAIL',
    availability: inCountries(['CA']),
    rank: RANK.domestic,
  }),

  // ── Latin America ──────────────────────────────────────────────────────────
  definition({
    id: 'PIX',
    brand: 'Pix',
    handle: 'ALIAS',
    availability: inCountries(['BR']),
    rank: RANK.domestic,
  }),
  definition({
    id: 'MERCADO_PAGO',
    brand: 'Mercado Pago',
    handle: 'TAG',
    availability: inCountries(['AR', 'BR', 'CL', 'CO', 'MX', 'PE', 'UY']),
    rank: RANK.domestic,
    rankByCountry: { BR: 30, CO: 30, PE: 30 },
  }),
  definition({
    id: 'CLABE',
    brand: null,
    labelKey: 'clabe',
    handle: 'ACCOUNT',
    availability: inCountries(['MX']),
    rank: RANK.domesticAlt,
  }),
  definition({
    id: 'CBU_ALIAS',
    brand: null,
    labelKey: 'cbuAlias',
    handle: 'TAG',
    availability: inCountries(['AR']),
    rank: RANK.domesticAlt,
  }),
  definition({
    id: 'MACH',
    brand: 'MACH',
    handle: 'PHONE',
    availability: inCountries(['CL']),
    rank: RANK.domesticAlt,
  }),
  definition({
    id: 'NEQUI',
    brand: 'Nequi',
    handle: 'PHONE',
    availability: inCountries(['CO']),
    rank: RANK.domestic,
  }),
  definition({
    id: 'DAVIPLATA',
    brand: 'Daviplata',
    handle: 'PHONE',
    availability: inCountries(['CO']),
    rank: RANK.domesticAlt,
  }),
  definition({
    id: 'YAPE',
    brand: 'Yape',
    handle: 'PHONE',
    availability: inCountries(['PE']),
    rank: RANK.domestic,
  }),
  definition({
    id: 'PLIN',
    brand: 'Plin',
    handle: 'PHONE',
    availability: inCountries(['PE']),
    rank: RANK.domesticAlt,
  }),
  definition({
    id: 'DEUNA',
    brand: 'DeUna',
    handle: 'PHONE',
    availability: inCountries(['EC']),
    rank: RANK.domesticAlt,
  }),
  definition({
    id: 'TIGO_MONEY',
    brand: 'Tigo Money',
    handle: 'PHONE',
    availability: inCountries(['PY', 'BO', 'GT', 'HN', 'SV', 'NI']),
    rank: RANK.domesticAlt,
  }),
  definition({
    id: 'PAGO_MOVIL',
    brand: 'Pago Móvil',
    handle: 'PHONE',
    availability: inCountries(['VE']),
    rank: RANK.domestic,
  }),

  // ── Africa ─────────────────────────────────────────────────────────────────
  definition({
    id: 'PAYSHAP',
    brand: 'PayShap',
    handle: 'PHONE',
    availability: inCountries(['ZA']),
    rank: RANK.domestic,
  }),
  definition({
    id: 'SNAPSCAN',
    brand: 'SnapScan',
    handle: 'PHONE',
    availability: inCountries(['ZA']),
    rank: RANK.domesticAlt,
  }),
];

const BY_ID: ReadonlyMap<string, PaymentMethodDef> = new Map(
  PAYMENT_METHODS.map((method) => [method.id, method]),
);

export function getPaymentMethod(id: string | null | undefined): PaymentMethodDef | undefined {
  return id ? BY_ID.get(id) : undefined;
}

/**
 * Normalise whatever `City.country` holds into an upper-case ISO-3166 alpha-2.
 *
 * The column stores display names in production ("Spain", "Bosnia and
 * Herzegovina"), so this cannot be a length check — it delegates to the one
 * shared name map. Getting that wrong is not a small bug: every country would
 * fall through to the three universal methods and Bizum would never appear in
 * Spain.
 */
export function normalizeCountryIso2(country: string | null | undefined): string | undefined {
  return resolveCountryIso2(country);
}

export function isPaymentMethodAvailableInCountry(
  method: PaymentMethodDef,
  countryIso2: string | null | undefined,
): boolean {
  if (method.availability.scope === 'GLOBAL') return true;
  const iso2 = normalizeCountryIso2(countryIso2);
  // An unknown country gets the universal list only — better a short honest
  // list than a long wrong one.
  if (!iso2) return false;
  return method.availability.countries.includes(iso2);
}

export function paymentMethodRank(method: PaymentMethodDef, countryIso2: string | null | undefined): number {
  const iso2 = normalizeCountryIso2(countryIso2);
  const override = iso2 ? method.rankByCountry?.[iso2] : undefined;
  return override ?? method.rank;
}

/**
 * The picker's list for one country: `CUSTOM` first, the local rails next, the
 * universal fallbacks last. Ties break on id so the order is stable.
 */
export function paymentMethodsForCountry(
  countryIso2: string | null | undefined,
): readonly PaymentMethodDef[] {
  return PAYMENT_METHODS.filter((method) => isPaymentMethodAvailableInCountry(method, countryIso2)).sort(
    (a, b) => {
      const delta = paymentMethodRank(a, countryIso2) - paymentMethodRank(b, countryIso2);
      return delta !== 0 ? delta : a.id.localeCompare(b.id);
    },
  );
}

/** Every country any method names — the set the catalogue claims to cover. */
export function coveredCountries(): readonly string[] {
  const set = new Set<string>();
  for (const method of PAYMENT_METHODS) {
    if (method.availability.scope === 'COUNTRIES') {
      for (const country of method.availability.countries) set.add(country);
    }
  }
  return Array.from(set).sort();
}

/**
 * The provider link for a filled-in method, or `null` when the method has no
 * addressable link (most phone-number rails) or the handle is empty.
 *
 * `@` and `$` prefixes are stripped: people write `@marko`, the URL wants `marko`.
 */
export function paymentMethodLink(id: string, handle: string | null | undefined): string | null {
  const method = getPaymentMethod(id);
  if (!method?.linkTemplate) return null;
  const cleaned = (handle ?? '').trim().replace(/^[@$]/, '');
  if (!cleaned) return null;
  return method.linkTemplate.replace('{handle}', encodeURIComponent(cleaned));
}
