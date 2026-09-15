import { Clipboard } from '@capacitor/clipboard';
import { isCapacitor } from '@/utils/capacitor';
import { getApiAxiosBaseURL } from '@/api/apiBaseUrl';
import {
  captureAppAttributionFromLocation,
  getAttributionForAuth,
  parseAidFromClipboard,
  persistAttribution,
  readStoredAttribution,
  type AppAttributionSnapshot,
} from '@/utils/appAttribution';
import { api } from '@/api/httpClient';

let clipboardIngested = false;
let reportedAid: string | null = null;
let viewHitSent = false;

export async function ingestAttributionClipboard(): Promise<void> {
  if (clipboardIngested || !isCapacitor()) return;
  clipboardIngested = true;
  try {
    const { value } = await Clipboard.read();
    const aid = parseAidFromClipboard(value);
    if (!aid) return;
    const current = readStoredAttribution();
    const next: AppAttributionSnapshot = current
      ? { ...current, aid: current.aid || aid }
      : {
          aid,
          utmSource: null,
          utmMedium: null,
          utmCampaign: null,
          utmContent: null,
          utmTerm: null,
          choice: null,
        };
    persistAttribution({ ...next, aid: next.aid || aid });
  } catch {
    /* paste permission denied */
  }
}

export function reportLinkToAppLandingView(pathname: string | undefined, search: string): void {
  const path = (pathname ?? '').replace(/\/+$/, '') || '/';
  if (path !== '/link-to-app' || viewHitSent) return;
  viewHitSent = true;
  const snapshot = readStoredAttribution();
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  if (snapshot?.aid) params.set('aid', snapshot.aid);
  params.set('kind', 'view');
  const base = getApiAxiosBaseURL().replace(/\/$/, '');
  try {
    void fetch(`${base}/public/link-to-app/hit?${params.toString()}`, {
      credentials: isCapacitor() ? 'omit' : 'include',
      cache: 'no-store',
      keepalive: true,
    });
  } catch {
    /* ignore */
  }
}

export async function bootstrapAppAttribution(location?: {
  search: string;
  pathname?: string;
}): Promise<AppAttributionSnapshot | null> {
  await ingestAttributionClipboard();
  const loc =
    location ??
    (typeof window !== 'undefined'
      ? { search: window.location.search, pathname: window.location.pathname }
      : null);
  if (loc) {
    captureAppAttributionFromLocation(loc);
    reportLinkToAppLandingView(loc.pathname, loc.search);
  }
  return readStoredAttribution();
}

export async function reportStoredAttributionIfAuthed(token: string | null): Promise<void> {
  const snapshot = getAttributionForAuth();
  if (!token || !snapshot || reportedAid === snapshot.aid) return;
  reportedAid = snapshot.aid;
  try {
    await api.post('/auth/attribution', { attribution: snapshot });
  } catch {
    reportedAid = null;
  }
}
