import crypto from 'crypto';
import { AdPlacementKey, Sport } from '@prisma/client';

export function buildContextKey(cityId: string | undefined, sport: Sport | undefined): string {
  const payload = `${cityId ?? ''}|${sport ?? ''}`;
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

export function resolveSportForPlacement(
  placement: AdPlacementKey,
  sportsByPlacement: Partial<Record<AdPlacementKey, Sport>> | undefined,
  primarySport: Sport | undefined
): Sport | undefined {
  if (sportsByPlacement?.[placement]) {
    return sportsByPlacement[placement];
  }
  if (placement === AdPlacementKey.home_hero) {
    return primarySport;
  }
  return undefined;
}
