import type { LiveTeamSide } from '@/utils/liveScoring';

/** Tight golden ring for compact roster/footer rows (no outer blur — avoids clipping). */
export const SERVE_GOLDEN_RING = 'shadow-[0_0_0_2px_#fbbf24]';

/** Golden ring + soft glow for serve indicators (box-shadow keeps circles round on court avatars). */
export const SERVE_GOLDEN_HIGHLIGHT =
  'shadow-[0_0_0_2px_#fbbf24,0_0_0_3px_rgba(251,191,36,0.35),0_0_8px_1px_rgba(250,204,21,0.45)]';

export const SERVE_COURT_HIGHLIGHT = SERVE_GOLDEN_HIGHLIGHT;

export type ServeAvatarHighlightSize = 'xs' | 'sm' | 'md';

const SERVE_AVATAR_DIMS: Record<ServeAvatarHighlightSize, string> = {
  xs: 'h-4 w-4',
  sm: 'h-6 w-6',
  md: 'h-8 w-8',
};

/** Fixed-size circular wrap so box-shadow hugs the avatar face. */
export function serveAvatarHighlightWrap(
  active: boolean,
  size: ServeAvatarHighlightSize,
  variant: 'ring' | 'glow' = 'ring'
): string {
  const base = `flex ${SERVE_AVATAR_DIMS[size]} shrink-0 items-center justify-center overflow-visible`;
  if (!active) return base;
  const highlight = variant === 'glow' ? SERVE_GOLDEN_HIGHLIGHT : SERVE_GOLDEN_RING;
  return `${base} rounded-full ${highlight}`;
}

export const SERVE_SETUP_SELECTED =
  'border-amber-500/90 bg-gradient-to-br from-amber-50 via-white to-amber-50/70 ring-2 ring-amber-400/45 dark:border-amber-500/55 dark:from-amber-950/45 dark:via-gray-900 dark:to-amber-950/35 dark:ring-amber-400/30';

export const SERVE_SETUP_UNSELECTED =
  'border-gray-200/90 bg-white hover:border-gray-300 dark:border-gray-700/90 dark:bg-gray-900/80 dark:hover:border-gray-600';

export function courtPlayerIsServing(params: {
  endsSetup: boolean;
  showServeOverlay: boolean;
  serverTeam: LiveTeamSide | null | undefined;
  team: LiveTeamSide;
  serverPlayerIndex: number;
  playerIndex: number;
}): boolean {
  const { endsSetup, showServeOverlay, serverTeam, team, serverPlayerIndex, playerIndex } = params;
  if (serverTeam == null || serverTeam !== team || serverPlayerIndex !== playerIndex) return false;
  return showServeOverlay || endsSetup;
}
