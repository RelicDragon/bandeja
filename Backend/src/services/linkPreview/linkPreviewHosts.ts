/** Hosts that must not be OG-unfurled (handled elsewhere or unsafe). */

import { isAllowedGiphyHost } from '../giphyIngest/giphyHosts';
import { isBandejaAppHost } from './parseBandejaLink';

export function isSkippedLinkPreviewHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!host) return true;
  if (isBandejaAppHost(host)) return true;
  if (isAllowedGiphyHost(host)) return true;
  return false;
}
