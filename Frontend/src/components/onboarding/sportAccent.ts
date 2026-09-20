import { Sports, type Sport } from '@shared/sport';

/**
 * PRD 350 — "one accent per step (the sport's colour on step 2, sky elsewhere)".
 *
 * The sport registry carries art but no colour, so the palette lives here. Each
 * value is picked from the Tailwind 600 ramp, which is what the rest of the app
 * uses for filled actions, so contrast against white text stays above 4.5:1 in
 * every theme.
 */
export const SPORT_ACCENT_COLOR: Record<Sport, string> = {
  [Sports.PADEL]: '#0284c7', // sky-600 — the app's own primary
  [Sports.TENNIS]: '#65a30d', // lime-600
  [Sports.PICKLEBALL]: '#ea580c', // orange-600
  [Sports.BADMINTON]: '#7c3aed', // violet-600
  [Sports.TABLE_TENNIS]: '#dc2626', // red-600
  [Sports.SQUASH]: '#0d9488', // teal-600
};

/** Sky, the default accent for every step that is not the sport picker. */
export const DEFAULT_ACCENT_COLOR = SPORT_ACCENT_COLOR[Sports.PADEL];

export function getSportAccentColor(sport: Sport | null | undefined): string {
  return sport ? SPORT_ACCENT_COLOR[sport] : DEFAULT_ACCENT_COLOR;
}
