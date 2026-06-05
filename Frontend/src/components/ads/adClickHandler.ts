import { useNavigate } from 'react-router-dom';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { buildUrl } from '@/utils/urlSchema';
import type { AdClickAction, AdPlacementPayload } from '@/api/ads';

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
      if (isExternalUrl(clickUrl)) {
        await openExternalUrl(clickUrl);
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
