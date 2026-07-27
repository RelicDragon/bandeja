/** Intermediate chase = green; max-level chase = golden. */
export function trophyProgressFillClass(isMaxLevel: boolean): string {
  if (isMaxLevel) {
    return 'bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500';
  }
  return 'bg-emerald-500';
}

/** Frame/text/badge rarity used when max-level gold chrome applies. */
export function trophyMaxLevelDisplayRarity(
  isMaxLevel: boolean,
  rarity: 'COMMON' | 'RARE' | 'LEGENDARY',
): 'COMMON' | 'RARE' | 'LEGENDARY' {
  return isMaxLevel ? 'LEGENDARY' : rarity;
}

/** Locked chrome stays gray unless this is the family max (gold while still locked). */
export function trophyFrameLocked(locked: boolean, isMaxLevel: boolean): boolean {
  return locked && !isMaxLevel;
}
