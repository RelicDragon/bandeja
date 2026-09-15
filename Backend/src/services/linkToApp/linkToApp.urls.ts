import { APP_STORE_URL, PLAY_STORE_URL } from './linkToApp.constants';

export const LINK_TO_APP_CHOICES = ['ios', 'android', 'web'] as const;
export type LinkToAppChoice = (typeof LINK_TO_APP_CHOICES)[number];

export const LINK_TO_APP_KINDS = ['view', ...LINK_TO_APP_CHOICES] as const;
export type LinkToAppKind = (typeof LINK_TO_APP_KINDS)[number];

export type LinkToAppUtm = {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
};

const UTM_MAX = 80;
const APPLE_CT_MAX = 40;
const UTM_RE = /^[a-zA-Z0-9._-]+$/;

export function isLinkToAppChoice(value: string): value is LinkToAppChoice {
  return (LINK_TO_APP_CHOICES as readonly string[]).includes(value);
}

export function isLinkToAppKind(value: string): value is LinkToAppKind {
  return (LINK_TO_APP_KINDS as readonly string[]).includes(value);
}

function firstQueryValue(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return null;
}

export function sanitizeUtmValue(raw: unknown): string | null {
  const value = firstQueryValue(raw)?.trim() ?? '';
  if (!value || value.length > UTM_MAX || !UTM_RE.test(value)) return null;
  return value;
}

export function parseLinkToAppUtm(query: Record<string, unknown>): LinkToAppUtm {
  return {
    source: sanitizeUtmValue(query.utm_source),
    medium: sanitizeUtmValue(query.utm_medium),
    campaign: sanitizeUtmValue(query.utm_campaign),
    content: sanitizeUtmValue(query.utm_content),
    term: sanitizeUtmValue(query.utm_term),
  };
}

export function detectLinkToAppPlatform(userAgent: string | null): string {
  const ua = userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua) || (ua.includes('Mac OS') && /Mobile/i.test(ua))) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Macintosh|Windows|Linux/i.test(ua)) return 'desktop';
  return 'other';
}

function appleCampaignToken(campaign: string | null): string | null {
  if (!campaign) return null;
  const compact = campaign.replace(/[^a-zA-Z0-9]/g, '');
  if (!compact) return null;
  return compact.slice(0, APPLE_CT_MAX);
}

function appendUtm(url: URL, utm: LinkToAppUtm): void {
  if (utm.source) url.searchParams.set('utm_source', utm.source);
  if (utm.medium) url.searchParams.set('utm_medium', utm.medium);
  if (utm.campaign) url.searchParams.set('utm_campaign', utm.campaign);
  if (utm.content) url.searchParams.set('utm_content', utm.content);
  if (utm.term) url.searchParams.set('utm_term', utm.term);
}

export function buildLinkToAppDestination(opts: {
  choice: LinkToAppChoice;
  utm: LinkToAppUtm;
  aid: string | null;
  frontendUrl: string;
  appStoreCampaignProviderToken: string;
}): string {
  if (opts.choice === 'ios') {
    const url = new URL(APP_STORE_URL);
    if (opts.appStoreCampaignProviderToken) {
      url.searchParams.set('pt', opts.appStoreCampaignProviderToken);
    }
    const ct = opts.aid || appleCampaignToken(opts.utm.campaign);
    if (ct) url.searchParams.set('ct', ct);
    if (opts.appStoreCampaignProviderToken || ct) url.searchParams.set('mt', '8');
    return url.toString();
  }

  if (opts.choice === 'android') {
    const url = new URL(PLAY_STORE_URL);
    const referrer = new URLSearchParams();
    if (opts.utm.source) referrer.set('utm_source', opts.utm.source);
    if (opts.utm.medium) referrer.set('utm_medium', opts.utm.medium);
    if (opts.utm.campaign) referrer.set('utm_campaign', opts.utm.campaign);
    if (opts.utm.content) referrer.set('utm_content', opts.utm.content);
    if (opts.utm.term) referrer.set('utm_term', opts.utm.term);
    if (opts.aid) referrer.set('aid', opts.aid);
    const encoded = referrer.toString();
    if (encoded) url.searchParams.set('referrer', encoded);
    return url.toString();
  }

  const base = opts.frontendUrl.replace(/\/+$/, '') || 'https://bandeja.me';
  const url = new URL(base);
  appendUtm(url, opts.utm);
  if (opts.aid) url.searchParams.set('aid', opts.aid);
  url.searchParams.set('choice', opts.choice);
  return url.toString();
}
