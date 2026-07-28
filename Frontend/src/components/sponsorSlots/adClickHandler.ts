import { useNavigate } from 'react-router-dom';
import { isCapacitor } from '@/utils/capacitor';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { buildUrl } from '@/utils/urlSchema';
import type { AdClickAction, AdPlacementPayload } from '@/api/sponsorPlacements';

function readMetadataString(metadata: Record<string, unknown> | null | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function resolveMarketItemId(payload: AdPlacementPayload): string | undefined {
  return readMetadataString(payload.metadata, 'itemId') ?? readMetadataString(payload.metadata, 'marketItemId');
}

function resolveClubId(payload: AdPlacementPayload): string | undefined {
  return readMetadataString(payload.metadata, 'clubId');
}

function isExternalUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

function isSameOriginAbsoluteUrl(url: string): boolean {
  if (typeof window === 'undefined' || !isExternalUrl(url)) return false;
  try {
    return new URL(url).origin === window.location.origin;
  } catch {
    return false;
  }
}

const APP_HOSTED_STATIC_LANDINGS = new Set(['/LizaBirthday2026']);
const BANDEJA_WEB_HOSTS = new Set(['bandeja.me', 'www.bandeja.me']);

function resolveAppHostedStaticLandingHref(url: string): string | null {
  if (!isExternalUrl(url)) return null;

  try {
    const parsed = new URL(url);
    const normalizedPath = parsed.pathname.replace(/\/+$/, '') || '/';
    if (
      parsed.protocol !== 'https:' ||
      !BANDEJA_WEB_HOSTS.has(parsed.hostname) ||
      !APP_HOSTED_STATIC_LANDINGS.has(normalizedPath)
    ) {
      return null;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

/** Full document navigation — required for static `public/` pages (nginx), not SPA routes. */
function navigateSameOriginDocument(pathOrUrl: string) {
  const href = isExternalUrl(pathOrUrl)
    ? pathOrUrl
    : pathOrUrl.startsWith('/')
      ? pathOrUrl
      : `/${pathOrUrl}`;
  window.location.assign(href);
}

function navigateInApp(navigate: ReturnType<typeof useNavigate>, path: string) {
  if (!path.startsWith('/')) {
    navigate(buildUrl('home'));
    return;
  }
  navigate(path);
}

export async function executeAdClick(
  payload: AdPlacementPayload,
  navigate: ReturnType<typeof useNavigate>,
): Promise<void> {
  const clickUrl = payload.clickUrl?.trim();
  if (!clickUrl) return;

  switch (payload.clickAction as AdClickAction) {
    case 'IN_APP_ROUTE':
      navigateInApp(navigate, clickUrl);
      return;
    case 'CLUB_PAGE': {
      const clubId = resolveClubId(payload) ?? clickUrl;
      if (clubId.startsWith('/')) {
        navigateInApp(navigate, clubId);
        return;
      }
      navigate(`/select-city?clubId=${encodeURIComponent(clubId)}`);
      return;
    }
    case 'MARKET_ITEM': {
      const itemId = resolveMarketItemId(payload) ?? clickUrl;
      if (itemId.startsWith('/')) {
        navigateInApp(navigate, itemId);
        return;
      }
      navigate(buildUrl('marketplaceItem', { id: itemId }));
      return;
    }
    case 'OPEN_URL':
    default:
      // Web: same-host static landings stay in-document.
      // Capacitor: never assign /LizaBirthday2026 inside the WebView (bundle/SPA bounce → home).
      // Use system browser for absolute bandeja URLs; relative paths also go external on native.
      if (isExternalUrl(clickUrl)) {
        const appHostedLandingHref = resolveAppHostedStaticLandingHref(clickUrl);
        if (appHostedLandingHref) {
          if (isCapacitor()) {
            await openExternalUrl(clickUrl);
            return;
          }
          navigateSameOriginDocument(appHostedLandingHref);
          return;
        }
        if (isSameOriginAbsoluteUrl(clickUrl)) {
          navigateSameOriginDocument(clickUrl);
          return;
        }
        await openExternalUrl(clickUrl);
        return;
      }
      if (clickUrl.startsWith('/')) {
        const pathOnly = (clickUrl.split('?')[0] || '').replace(/\/+$/, '') || '/';
        if (isCapacitor() && APP_HOSTED_STATIC_LANDINGS.has(pathOnly)) {
          await openExternalUrl(`https://bandeja.me${clickUrl}`);
          return;
        }
        navigateSameOriginDocument(clickUrl);
        return;
      }
      navigateInApp(navigate, clickUrl);
  }
}

export function adClickNeedsLeavingConfirm(payload: AdPlacementPayload): boolean {
  if (payload.clickUrlTrusted) return false;
  const clickUrl = payload.clickUrl?.trim() ?? '';
  if (payload.clickAction === 'OPEN_URL') return isExternalUrl(clickUrl);
  return isExternalUrl(clickUrl);
}
