/** Canonical sport IDs — keep in sync with Frontend/shared/sport.ts and `enum Sport` in prisma/schema.prisma. */

export const Sports = {
  PADEL: 'PADEL',
  TENNIS: 'TENNIS',
  PICKLEBALL: 'PICKLEBALL',
  BADMINTON: 'BADMINTON',
  TABLE_TENNIS: 'TABLE_TENNIS',
  SQUASH: 'SQUASH',
} as const;

export type Sport = (typeof Sports)[keyof typeof Sports];

export const ALL_SPORTS: readonly Sport[] = Object.values(Sports);

export const DEFAULT_SPORT: Sport = Sports.PADEL;

export function isSport(value: unknown): value is Sport {
  return typeof value === 'string' && (ALL_SPORTS as readonly string[]).includes(value);
}

export function parseSport(value: unknown, fallback: Sport = DEFAULT_SPORT): Sport {
  return isSport(value) ? value : fallback;
}
