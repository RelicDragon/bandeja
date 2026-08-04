/** Chase progress fill — emerald for all locked chases (gold is unlock-only). */
export function trophyProgressFillClass(_isMaxLevel = false): string {
  void _isMaxLevel;
  return 'bg-emerald-500';
}

/**
 * Promotes max-level unlocked family face to LEGENDARY chrome (progress ladders).
 * Event UNIQUE stays UNIQUE when unlocked as max.
 */
export function trophyMaxLevelDisplayRarity(
  isMaxLevel: boolean,
  unlocked: boolean,
  rarity: 'COMMON' | 'RARE' | 'LEGENDARY' | 'UNIQUE',
): 'COMMON' | 'RARE' | 'LEGENDARY' | 'UNIQUE' {
  if (rarity === 'UNIQUE') return 'UNIQUE';
  return isMaxLevel && unlocked ? 'LEGENDARY' : rarity;
}

/** Locked entries always use locked chrome — no gold while still locked. */
export function trophyFrameLocked(locked: boolean): boolean {
  return locked;
}
