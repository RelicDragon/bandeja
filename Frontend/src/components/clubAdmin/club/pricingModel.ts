/**
 * Pricing editor model (pure). Rule choice per wall-clock minute mirrors the server quote engine
 * (`clubAdminQuote.ts`): a court-specific rule beats a club-wide one, then the later
 * `startMinute`, then the smaller id. Minutes no rule covers use the court's base rate.
 */
import type { ClubPriceRule, IsoWeekday, PutClubPricingBody } from '@shared/clubAdmin/contract';

export interface PriceRuleDraft extends Omit<ClubPriceRule, 'id'> {
  /** Server id, or a local key for a new rule. */
  key: string;
  id?: string;
}

export type PriceSource = { kind: 'rule'; ruleKey: string; pricePerHourCents: number } | { kind: 'base'; pricePerHourCents: number } | { kind: 'none' };

export interface PriceSegment {
  startMinute: number;
  endMinute: number;
  source: PriceSource;
}

export type RuleErrorCode = 'weekdays' | 'range' | 'price';

function ruleApplies(rule: PriceRuleDraft, courtId: string | null, weekday: IsoWeekday, minute: number): boolean {
  if (rule.courtId !== null && rule.courtId !== courtId) return false;
  if (!rule.weekdays.includes(weekday)) return false;
  return minute >= rule.startMinute && minute < rule.endMinute;
}

function ruleTieKey(rule: PriceRuleDraft): string {
  return rule.id ?? rule.key;
}

/** The rule that prices `minute` on `weekday` for `courtId` (null = a club-wide view). */
export function resolveRuleAt(
  rules: readonly PriceRuleDraft[],
  courtId: string | null,
  weekday: IsoWeekday,
  minute: number
): PriceRuleDraft | null {
  let best: PriceRuleDraft | null = null;
  for (const r of rules) {
    if (!ruleApplies(r, courtId, weekday, minute)) continue;
    if (!best) {
      best = r;
      continue;
    }
    const rSpecific = r.courtId !== null;
    const bSpecific = best.courtId !== null;
    if (rSpecific !== bSpecific) {
      if (rSpecific) best = r;
      continue;
    }
    if (r.startMinute !== best.startMinute) {
      if (r.startMinute > best.startMinute) best = r;
      continue;
    }
    if (ruleTieKey(r) < ruleTieKey(best)) best = r;
  }
  return best;
}

export function resolvePriceAt(
  rules: readonly PriceRuleDraft[],
  courtId: string | null,
  baseRateCents: number | null,
  weekday: IsoWeekday,
  minute: number
): PriceSource {
  const rule = resolveRuleAt(rules, courtId, weekday, minute);
  if (rule) return { kind: 'rule', ruleKey: rule.key, pricePerHourCents: rule.pricePerHourCents };
  if (baseRateCents !== null) return { kind: 'base', pricePerHourCents: baseRateCents };
  return { kind: 'none' };
}

function sameSource(a: PriceSource, b: PriceSource): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'rule' && b.kind === 'rule') return a.ruleKey === b.ruleKey;
  if (a.kind === 'base' && b.kind === 'base') return a.pricePerHourCents === b.pricePerHourCents;
  return true;
}

/**
 * One weekday's price bands. Only rule edges can change the answer, so the day is evaluated at
 * every edge (not every minute) and adjacent equal bands are merged.
 */
export function dayPriceSegments(
  rules: readonly PriceRuleDraft[],
  courtId: string | null,
  baseRateCents: number | null,
  weekday: IsoWeekday
): PriceSegment[] {
  const edges = new Set<number>([0, 1440]);
  for (const r of rules) {
    if (!r.weekdays.includes(weekday)) continue;
    if (r.courtId !== null && r.courtId !== courtId) continue;
    edges.add(Math.max(0, Math.min(1440, r.startMinute)));
    edges.add(Math.max(0, Math.min(1440, r.endMinute)));
  }
  const sorted = [...edges].sort((a, b) => a - b);
  const out: PriceSegment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const startMinute = sorted[i];
    const endMinute = sorted[i + 1];
    if (endMinute <= startMinute) continue;
    const source = resolvePriceAt(rules, courtId, baseRateCents, weekday, startMinute);
    const prev = out[out.length - 1];
    if (prev && prev.endMinute === startMinute && sameSource(prev.source, source)) prev.endMinute = endMinute;
    else out.push({ startMinute, endMinute, source });
  }
  return out;
}

export function validateRule(rule: PriceRuleDraft): RuleErrorCode | null {
  if (rule.weekdays.length === 0) return 'weekdays';
  if (!(rule.startMinute >= 0 && rule.startMinute < rule.endMinute && rule.endMinute <= 1440)) return 'range';
  if (!Number.isInteger(rule.pricePerHourCents) || rule.pricePerHourCents < 0) return 'price';
  return null;
}

/** `HH:mm` → minutes; `24:00` / `00:00` as an end means end of day (1440). */
export function timeToRuleMinute(hhmm: string, asEnd: boolean): number {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return NaN;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  if (asEnd && minutes === 0) return 1440;
  return minutes;
}

export function ruleMinuteToTime(minutes: number): string {
  const m = minutes >= 1440 ? 0 : minutes;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Major-unit text input → cents (null when empty or invalid). */
export function parseMoneyInput(raw: string): number | null {
  const s = raw.trim().replace(',', '.');
  if (!s) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

export function buildPricingBody(
  currency: string,
  rules: readonly PriceRuleDraft[],
  billableHoldLabels: PutClubPricingBody['billableHoldLabels']
): PutClubPricingBody {
  return {
    currency,
    rules: rules.map((r) => ({
      ...(r.id ? { id: r.id } : {}),
      courtId: r.courtId,
      label: r.label?.trim() || null,
      weekdays: [...r.weekdays].sort((a, b) => a - b),
      startMinute: r.startMinute,
      endMinute: r.endMinute,
      pricePerHourCents: r.pricePerHourCents,
    })),
    billableHoldLabels: billableHoldLabels.filter((l) => l !== 'MAINTENANCE'),
  };
}
