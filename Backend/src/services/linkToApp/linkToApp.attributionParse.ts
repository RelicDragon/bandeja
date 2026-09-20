import { isLinkToAppAid } from './linkToApp.aid';
import { normalizeReferralCode } from '../referral/referralCode';
import { isLinkToAppChoice, parseLinkToAppUtm, sanitizeUtmValue, type LinkToAppChoice, type LinkToAppUtm } from './linkToApp.urls';

export const LINK_TO_APP_AUTH_KINDS = ['register', 'login'] as const;
export type LinkToAppAuthKind = (typeof LINK_TO_APP_AUTH_KINDS)[number];

export type LinkToAppAttributionInput = {
  aid: string | null;
  utm: LinkToAppUtm;
  choice: LinkToAppChoice | null;
  /**
   * PRD 351 — normalized referral code from `?ref=CODE`, carried next to `aid`
   * through the landing page, localStorage and the auth request body. `null`
   * when absent or malformed; the attach itself is still first-touch, so a
   * later `ref` never overwrites one that is already stored.
   */
  ref: string | null;
};

function recordFromUnknown(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function pickAid(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return isLinkToAppAid(trimmed) ? trimmed : null;
}

export function isLinkToAppAuthKind(value: string): value is LinkToAppAuthKind {
  return (LINK_TO_APP_AUTH_KINDS as readonly string[]).includes(value);
}

export function parseLinkToAppAttributionInput(
  queryOrBody: Record<string, unknown>,
  cookieAid?: string | null
): LinkToAppAttributionInput {
  const nested = recordFromUnknown(queryOrBody.attribution);
  const merged: Record<string, unknown> = { ...queryOrBody, ...nested };
  if (nested.utmSource && !merged.utm_source) merged.utm_source = nested.utmSource;
  if (nested.utmMedium && !merged.utm_medium) merged.utm_medium = nested.utmMedium;
  if (nested.utmCampaign && !merged.utm_campaign) merged.utm_campaign = nested.utmCampaign;
  if (nested.utmContent && !merged.utm_content) merged.utm_content = nested.utmContent;
  if (nested.utmTerm && !merged.utm_term) merged.utm_term = nested.utmTerm;

  const choiceRaw = typeof merged.choice === 'string' ? merged.choice : '';
  return {
    aid: pickAid(merged.aid) ?? (cookieAid && isLinkToAppAid(cookieAid) ? cookieAid : null),
    utm: parseLinkToAppUtm(merged),
    choice: isLinkToAppChoice(choiceRaw) ? choiceRaw : null,
    ref: normalizeReferralCode(merged.ref),
  };
}

export function attributionHasSignal(input: LinkToAppAttributionInput): boolean {
  return Boolean(
    input.aid ||
      input.ref ||
      input.utm.source ||
      input.utm.medium ||
      input.utm.campaign ||
      input.utm.content ||
      input.utm.term
  );
}

export function coalesceUtm(primary: LinkToAppUtm, fallback: LinkToAppUtm): LinkToAppUtm {
  return {
    source: primary.source ?? fallback.source,
    medium: primary.medium ?? fallback.medium,
    campaign: primary.campaign ?? fallback.campaign,
    content: primary.content ?? fallback.content,
    term: primary.term ?? fallback.term,
  };
}

export { sanitizeUtmValue };
