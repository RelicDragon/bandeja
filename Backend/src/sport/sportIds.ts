export * from '../../../Frontend/shared/sport';

import { Sport as PrismaSport } from '@prisma/client';
import { ALL_SPORTS, isSport, type Sport } from '../../../Frontend/shared/sport';

/** Prisma client enum — same string values as `shared/sport`. */
export type PrismaSportType = PrismaSport;

export function asPrismaSport(sport: Sport): PrismaSport {
  return sport as PrismaSport;
}

/** Shared sport IDs must match Prisma `enum Sport`. */
export function assertSharedSportMatchesPrisma(): void {
  const prismaValues = new Set(Object.values(PrismaSport));
  for (const s of ALL_SPORTS) {
    if (!prismaValues.has(s as PrismaSport)) {
      throw new Error(`shared/sport missing Prisma enum value: ${s}`);
    }
  }
  for (const p of Object.values(PrismaSport)) {
    if (!isSport(p)) {
      throw new Error(`Prisma Sport has value not in shared/sport: ${p}`);
    }
  }
}
