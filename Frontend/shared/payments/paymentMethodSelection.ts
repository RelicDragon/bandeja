/**
 * PRD 348 — reading, validating and summarising an organiser's payment methods.
 *
 * Stored as JSON (`Game.paymentMethods`, `User.payoutMethods`) rather than a
 * column per provider: the catalogue in `./paymentMethods` grows with every new
 * market and a column per Bizum/Pix/Prenesi would be absurd.
 *
 * Shared by the API (which validates writes) and the app (which builds the
 * form), so one definition of "valid" serves both.
 */

import {
  CUSTOM_PAYMENT_METHOD_ID,
  PAYMENT_HANDLE_RULES,
  getPaymentMethod,
  type PaymentMethodDef,
} from './paymentMethods';

/** One row of the organiser's "how to pay me" list. */
export interface PaymentMethodEntry {
  /** A {@link PAYMENT_METHODS} id. */
  method: string;
  /** The phone / tag / IBAN / free text. `null` only for `CASH`. */
  handle: string | null;
}

/**
 * Three is the point where a settle sheet stops being an answer and starts
 * being a menu. It is also what fits above the fold on a phone.
 */
export const MAX_PAYMENT_METHODS = 3;

export type PaymentMethodIssueCode =
  | 'tooMany'
  | 'unknownMethod'
  | 'duplicateMethod'
  | 'handleRequired'
  | 'handleTooLong'
  | 'handleInvalid';

export interface PaymentMethodIssue {
  code: PaymentMethodIssueCode;
  /** Index into the submitted list; `-1` for list-level issues. */
  index: number;
  method?: string;
}

/** i18n key the API raises for an issue, mirrored by `cost.payment.errors.*` on the client. */
export function paymentMethodIssueKey(issue: PaymentMethodIssue): string {
  return `errors.cost.paymentMethod.${issue.code}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanHandle(raw: unknown, def: PaymentMethodDef): string | null {
  if (def.handle === 'NONE') return null;
  if (typeof raw !== 'string') return null;
  // Collapse the whitespace people paste out of a banking app, but keep the
  // single spaces that make an IBAN or a sort code readable.
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Tolerant read of a stored value. Never throws and never reports: rows written
 * by an older build, or by a catalogue entry since removed, are dropped rather
 * than allowed to break a game detail response.
 */
export function parsePaymentMethods(raw: unknown): PaymentMethodEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: PaymentMethodEntry[] = [];
  for (const item of raw) {
    if (out.length >= MAX_PAYMENT_METHODS) break;
    if (!isRecord(item)) continue;
    const id = typeof item.method === 'string' ? item.method : '';
    const def = getPaymentMethod(id);
    if (!def || seen.has(def.id)) continue;
    const handle = cleanHandle(item.handle, def);
    // A method that needs a handle and has lost it says nothing useful.
    if (!handle && def.handle !== 'NONE') continue;
    seen.add(def.id);
    out.push({ method: def.id, handle });
  }
  return out;
}

export interface ValidatePaymentMethodsResult {
  value: PaymentMethodEntry[];
  issues: PaymentMethodIssue[];
}

/**
 * Strict check for a write.
 *
 * Deliberately **not** filtered by country. The catalogue decides what the
 * picker *offers* in Belgrade; it does not get to veto a Spaniard who organises
 * a game there and really does want to be Bizum'd. Country is a relevance
 * filter, never a permission.
 */
export function validatePaymentMethods(raw: unknown): ValidatePaymentMethodsResult {
  const issues: PaymentMethodIssue[] = [];
  if (raw == null) return { value: [], issues };
  if (!Array.isArray(raw)) {
    return { value: [], issues: [{ code: 'unknownMethod', index: -1 }] };
  }
  if (raw.length > MAX_PAYMENT_METHODS) {
    issues.push({ code: 'tooMany', index: -1 });
  }

  const seen = new Set<string>();
  const value: PaymentMethodEntry[] = [];

  raw.slice(0, MAX_PAYMENT_METHODS).forEach((item, index) => {
    const id = isRecord(item) && typeof item.method === 'string' ? item.method : '';
    const def = getPaymentMethod(id);
    if (!def) {
      issues.push({ code: 'unknownMethod', index, method: id || undefined });
      return;
    }
    if (seen.has(def.id)) {
      issues.push({ code: 'duplicateMethod', index, method: def.id });
      return;
    }

    const rules = PAYMENT_HANDLE_RULES[def.handle];
    const handle = cleanHandle(isRecord(item) ? item.handle : null, def);

    if (def.handle !== 'NONE') {
      if (!handle) {
        issues.push({ code: 'handleRequired', index, method: def.id });
        return;
      }
      if (handle.length > rules.maxLength) {
        issues.push({ code: 'handleTooLong', index, method: def.id });
        return;
      }
      if (rules.pattern && !rules.pattern.test(handle)) {
        issues.push({ code: 'handleInvalid', index, method: def.id });
        return;
      }
    }

    seen.add(def.id);
    value.push({ method: def.id, handle });
  });

  return { value, issues };
}

/** English fallbacks for the brandless methods, used only where no locale is available. */
const PLAIN_LABELS: Record<string, string> = {
  CUSTOM: '',
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank transfer',
  IBAN: 'IBAN',
  CARD_TRANSFER: 'Card',
  UK_BANK: 'Bank transfer',
  RS_ACCOUNT: 'Account',
  HU_INSTANT: 'Instant transfer',
  CLABE: 'CLABE',
  CBU_ALIAS: 'Alias',
};

/** `"Bizum +34 600 11 22 33"` — one entry, brand first, for a plain-text line. */
export function formatPaymentMethodEntry(entry: PaymentMethodEntry): string {
  const def = getPaymentMethod(entry.method);
  if (!def) return entry.handle ?? '';
  const label = def.brand ?? PLAIN_LABELS[def.id] ?? '';
  // CUSTOM is the organiser's own words — never prefix it with a label.
  if (def.id === CUSTOM_PAYMENT_METHOD_ID) return entry.handle ?? '';
  return [label, entry.handle].filter(Boolean).join(' ').trim();
}

/** Longest legacy `Game.paymentHint` the column accepts. */
export const PAYMENT_HINT_MAX_LENGTH = 120;

/**
 * One line summarising the whole list, written through to the legacy
 * `Game.paymentHint` column.
 *
 * Installed app builds from before the catalogue read `paymentHint` and nothing
 * else; dropping it would blank the settle sheet for every phone that has not
 * updated. Those clients keep getting a readable string, and this app reads the
 * structured list.
 */
export function formatPaymentMethodsSummary(entries: readonly PaymentMethodEntry[]): string | null {
  const parts = entries.map(formatPaymentMethodEntry).filter((part) => part.length > 0);
  if (parts.length === 0) return null;
  const joined = parts.join(' · ');
  if (joined.length <= PAYMENT_HINT_MAX_LENGTH) return joined;
  // Truncate by code point, not by UTF-16 unit: an organiser whose custom note
  // ends in an emoji would otherwise be cut mid-surrogate, and a lone
  // surrogate is not encodable UTF-8 — Postgres stores it as U+FFFD.
  const points = Array.from(joined).slice(0, PAYMENT_HINT_MAX_LENGTH - 1);
  return `${points.join('').trimEnd()}…`;
}

/**
 * A pre-catalogue free-text hint, read as the list it always was: one `CUSTOM`
 * entry. Used when a `Game` written before this change is opened.
 */
export function paymentMethodsFromLegacyHint(hint: string | null | undefined): PaymentMethodEntry[] {
  const trimmed = (hint ?? '').trim();
  if (!trimmed) return [];
  return [
    {
      method: CUSTOM_PAYMENT_METHOD_ID,
      handle: trimmed.slice(0, PAYMENT_HANDLE_RULES.TEXT.maxLength),
    },
  ];
}

/**
 * What the game should show: the structured list when it has one, the legacy
 * hint read as `CUSTOM` otherwise.
 */
export function resolvePaymentMethods(
  stored: unknown,
  legacyHint: string | null | undefined,
): PaymentMethodEntry[] {
  const parsed = parsePaymentMethods(stored);
  return parsed.length > 0 ? parsed : paymentMethodsFromLegacyHint(legacyHint);
}
