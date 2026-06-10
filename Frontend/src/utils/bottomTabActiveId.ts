import type { Place } from '@/utils/urlSchema';
import { isChatShellPlace, isMarketplaceShellPlace } from '@/utils/urlSchema';

export type BottomTabId = 'my' | 'find' | 'chats' | 'marketplace' | 'leaderboard';

export function resolveBottomTabActiveId(place: Place): BottomTabId | null {
  if (place === 'home') return 'my';
  if (place === 'find') return 'find';
  if (isChatShellPlace(place)) return 'chats';
  if (isMarketplaceShellPlace(place)) return 'marketplace';
  if (place === 'leaderboard') return 'leaderboard';
  if (place === 'profile') return null;
  return 'my';
}
