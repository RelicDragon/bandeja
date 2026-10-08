import type { RecapOwner, RecapSlideKind } from '@/api/recap';
import { publicMemberTheme } from '@/utils/memberShowcase';
import type { MemberThemeId } from '@/utils/mainTheme';

/**
 * PRD 353 — one accent per recap slide on a shared dark base.
 *
 * Light, Dark, Classic and Premium all show the *same* dark slide base (a story
 * is full-bleed media, not a themed surface), so these are fixed class strings
 * rather than tokens. Tailwind must see them as static literals, hence the
 * switch instead of a template.
 */

export function recapSlideBackgroundClass(kind: RecapSlideKind, premium: boolean): string {
  if (kind === 'COVER' && premium) {
    // Premium keeps its gold accent on the cover, as the shell does elsewhere.
    return 'bg-gradient-to-br from-amber-500 via-yellow-600 to-slate-950';
  }
  switch (kind) {
    case 'COVER':
      return 'bg-gradient-to-br from-sky-500 via-violet-600 to-slate-950';
    case 'GAMES':
      return 'bg-gradient-to-br from-sky-600 via-sky-800 to-slate-950';
    case 'WINS':
      return 'bg-gradient-to-br from-emerald-500 via-emerald-800 to-slate-950';
    case 'LEVEL':
      return 'bg-gradient-to-br from-violet-500 via-violet-800 to-slate-950';
    case 'PARTNER':
      return 'bg-gradient-to-br from-pink-500 via-fuchsia-800 to-slate-950';
    case 'STREAK':
      return 'bg-gradient-to-br from-orange-500 via-orange-800 to-slate-950';
    case 'CLUB':
      return 'bg-gradient-to-br from-teal-500 via-teal-800 to-slate-950';
    case 'LOW_ACTIVITY':
      return 'bg-gradient-to-br from-sky-500 via-slate-700 to-slate-950';
    case 'OUTRO':
    default:
      return 'bg-gradient-to-br from-indigo-500 via-indigo-800 to-slate-950';
  }
}

export function recapSlideGlowClass(kind: RecapSlideKind, premium: boolean): string {
  if (kind === 'COVER' && premium) return 'bg-amber-200/40';
  switch (kind) {
    case 'COVER':
      return 'bg-sky-300/40';
    case 'GAMES':
      return 'bg-sky-200/35';
    case 'WINS':
      return 'bg-emerald-200/40';
    case 'LEVEL':
      return 'bg-violet-200/40';
    case 'PARTNER':
      return 'bg-pink-200/40';
    case 'STREAK':
      return 'bg-orange-200/45';
    case 'CLUB':
      return 'bg-teal-200/40';
    case 'LOW_ACTIVITY':
      return 'bg-sky-200/30';
    case 'OUTRO':
    default:
      return 'bg-indigo-200/40';
  }
}

/**
 * The sharer's member theme, or null for the classic accents. A themed recap
 * paints the theme scene on its bookends (cover, outro) and a themed frame on
 * every slide; the middle slides keep their one accent each. Same rule as the
 * server-rendered share images.
 */
export function recapOwnerMemberTheme(owner: RecapOwner): MemberThemeId | null {
  return publicMemberTheme({ isPremium: owner.isPremium, mainTheme: owner.memberTheme });
}

export function recapSlideIsThemedBookend(kind: RecapSlideKind): boolean {
  return kind === 'COVER' || kind === 'OUTRO';
}

/** The recap rail bubble's ring: sky → violet, not the usual story conic ring. */
export const RECAP_BUBBLE_RING_CLASS =
  'bg-[linear-gradient(135deg,#38bdf8_0%,#818cf8_50%,#a855f7_100%)] p-[2.5px]';
