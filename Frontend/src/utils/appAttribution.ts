import { normalizeReferralCode, REFERRAL_QUERY_PARAM } from '@/features/referral/referralCode';

export const APP_ATTRIBUTION_STORAGE_KEY = 'bandeja.attribution';
export const APP_ATTRIBUTION_COOKIE = 'bandeja_aid';
export const APP_ATTRIBUTION_AID_RE = /^[a-zA-Z0-9]{8,32}$/;

export type AppAttributionChoice = 'ios' | 'android' | 'web';

export type AppAttributionSnapshot = {
  aid: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  choice: AppAttributionChoice | null;
  /**
   * PRD 351 — referral code captured from `?ref=CODE`, stored next to `aid` and
   * carried into the auth request body by the axios interceptor.
   *
   * It obeys the same **first-touch** rule as the UTMs: once a `ref` is stored,
   * a later link never replaces it (`mergeAttributionFirstTouch`). Canonical
   * stored form — uppercase, no dash.
   */
  ref: string | null;
};

const UTM_RE = /^[a-zA-Z0-9._-]+$/;
const UTM_MAX = 80;
const CHOICES: AppAttributionChoice[] = ['ios', 'android', 'web'];

export function isAppAttributionAid(value: string): boolean {
  return APP_ATTRIBUTION_AID_RE.test(value);
}

export function createAppAttributionAid(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

export function sanitizeAppUtmValue(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? '';
  if (!value || value.length > UTM_MAX || !UTM_RE.test(value)) return null;
  return value;
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const [rawName, ...rest] = part.trim().split('=');
    if (rawName !== name) continue;
    const value = rest.join('=').trim();
    return value || null;
  }
  return null;
}

function writeAidCookie(aid: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${APP_ATTRIBUTION_COOKIE}=${aid}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

function emptyUtm(): Pick<
  AppAttributionSnapshot,
  'utmSource' | 'utmMedium' | 'utmCampaign' | 'utmContent' | 'utmTerm'
> {
  return {
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmContent: null,
    utmTerm: null,
  };
}

export function parseAttributionFromSearch(search: string): Partial<AppAttributionSnapshot> {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const aidRaw = params.get('aid');
  const choiceRaw = params.get('choice');
  return {
    aid: aidRaw && isAppAttributionAid(aidRaw) ? aidRaw : undefined,
    ref: normalizeReferralCode(params.get(REFERRAL_QUERY_PARAM)),
    utmSource: sanitizeAppUtmValue(params.get('utm_source')),
    utmMedium: sanitizeAppUtmValue(params.get('utm_medium')),
    utmCampaign: sanitizeAppUtmValue(params.get('utm_campaign')),
    utmContent: sanitizeAppUtmValue(params.get('utm_content')),
    utmTerm: sanitizeAppUtmValue(params.get('utm_term')),
    choice: CHOICES.includes(choiceRaw as AppAttributionChoice)
      ? (choiceRaw as AppAttributionChoice)
      : null,
  };
}

export function readStoredAttribution(): AppAttributionSnapshot | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(APP_ATTRIBUTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AppAttributionSnapshot>;
    if (!parsed.aid || !isAppAttributionAid(parsed.aid)) return null;
    return {
      aid: parsed.aid,
      ref: normalizeReferralCode(parsed.ref),
      utmSource: sanitizeAppUtmValue(parsed.utmSource),
      utmMedium: sanitizeAppUtmValue(parsed.utmMedium),
      utmCampaign: sanitizeAppUtmValue(parsed.utmCampaign),
      utmContent: sanitizeAppUtmValue(parsed.utmContent),
      utmTerm: sanitizeAppUtmValue(parsed.utmTerm),
      choice: CHOICES.includes(parsed.choice as AppAttributionChoice)
        ? (parsed.choice as AppAttributionChoice)
        : null,
    };
  } catch {
    return null;
  }
}

export function mergeAttributionFirstTouch(
  current: AppAttributionSnapshot | null,
  incoming: Partial<AppAttributionSnapshot>
): AppAttributionSnapshot | null {
  const cookieAid = readCookie(APP_ATTRIBUTION_COOKIE);
  const aid =
    current?.aid ||
    (incoming.aid && isAppAttributionAid(incoming.aid) ? incoming.aid : null) ||
    (cookieAid && isAppAttributionAid(cookieAid) ? cookieAid : null);
  const hasUtm = Boolean(
    incoming.utmSource || incoming.utmMedium || incoming.utmCampaign || incoming.utmContent || incoming.utmTerm
  );
  if (!aid && !hasUtm && !incoming.choice && !incoming.ref) return current;
  const nextAid = aid ?? createAppAttributionAid();
  const base = current ?? { aid: nextAid, ...emptyUtm(), choice: null, ref: null };
  return {
    aid: base.aid || nextAid,
    // First touch wins, exactly like the UTMs: a second invite link never
    // reassigns a referrer the user already arrived with (PRD 351).
    ref: base.ref ?? incoming.ref ?? null,
    utmSource: base.utmSource ?? incoming.utmSource ?? null,
    utmMedium: base.utmMedium ?? incoming.utmMedium ?? null,
    utmCampaign: base.utmCampaign ?? incoming.utmCampaign ?? null,
    utmContent: base.utmContent ?? incoming.utmContent ?? null,
    utmTerm: base.utmTerm ?? incoming.utmTerm ?? null,
    choice: base.choice ?? incoming.choice ?? null,
  };
}

export function persistAttribution(snapshot: AppAttributionSnapshot): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(APP_ATTRIBUTION_STORAGE_KEY, JSON.stringify(snapshot));
  }
  writeAidCookie(snapshot.aid);
}

export function captureAppAttributionFromLocation(location: {
  search: string;
  pathname?: string;
}): AppAttributionSnapshot | null {
  const incoming = parseAttributionFromSearch(location.search);
  const merged = mergeAttributionFirstTouch(readStoredAttribution(), incoming);
  if (merged) persistAttribution(merged);
  return merged;
}

export function getAttributionForAuth(): AppAttributionSnapshot | null {
  return readStoredAttribution();
}

/** PRD 351 — the referral code this device arrived with, if any. */
export function getCapturedReferralCode(): string | null {
  return readStoredAttribution()?.ref ?? null;
}

/**
 * PRD 351 — stores a code the user typed on the Register screen, before an
 * account exists to attach it to.
 *
 * Goes through `mergeAttributionFirstTouch`, so it can only ever *fill* an
 * empty `ref`; a code captured from a link always wins. Returns the code that
 * is now stored, which may be an earlier one.
 */
export function captureManualReferralCode(code: string): string | null {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return getCapturedReferralCode();
  const merged = mergeAttributionFirstTouch(readStoredAttribution(), { ref: normalized });
  if (merged) persistAttribution(merged);
  return merged?.ref ?? null;
}

export function isAuthAttributionRequestUrl(url: string | undefined): boolean {
  const path = (url ?? '').split('?')[0];
  return /\/(auth\/register\/phone|auth\/login\/phone|auth\/login\/apple|auth\/login\/google|auth\/google\/exchange|auth\/attribution|telegram\/verify-otp|telegram\/verify-link-key)$/.test(
    path
  );
}
