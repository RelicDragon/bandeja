import type { Sport } from '@/sport/sportRegistry';

/** PNG assets under `public/sports/`. */
export const SPORT_PUBLIC_ICON: Record<Sport, string> = {
  PADEL: '/sports/padel.png',
  TENNIS: '/sports/tennis.png',
  PICKLEBALL: '/sports/pickleball.png',
  BADMINTON: '/sports/badminton.png',
  TABLE_TENNIS: '/sports/ping-pong.png',
  SQUASH: '/sports/squash.png',
};

export function getSportPublicIcon(sport: Sport): string {
  return SPORT_PUBLIC_ICON[sport];
}
