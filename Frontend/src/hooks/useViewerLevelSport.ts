import { useAuthStore } from '@/store/authStore';
import { getViewerPrimarySport } from '@/utils/profileSports';
import type { Sport } from '@shared/sport';

/**
 * Sport for level badges on other players in chat surfaces: the viewer's own
 * default sport, not the viewed player's. Players without this sport show a
 * gray "-" badge (no fallback to the player's primary sport).
 */
export function useViewerLevelSport(): Sport {
  const viewer = useAuthStore((state) => state.user);
  return getViewerPrimarySport(viewer);
}
