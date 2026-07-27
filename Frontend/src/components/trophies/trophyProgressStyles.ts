/** Chase progress fill — emerald for all locked chases (gold is unlock-only). */
export function trophyProgressFillClass(_isMaxLevel = false): string {
  void _isMaxLevel;
  return 'bg-emerald-500';
}

/**
 * Golden LEGENDARY chrome only when the family max is unlocked.
 * Locked max/legendary stays on its native rarity with locked (gray) treatment.
 */
export function trophyMaxLevelDisplayRarity(
  isMaxLevel: boolean,
  unlocked: boolean,
  rarity: 'COMMON' | 'RARE' | 'LEGENDARY',
): 'COMMON' | 'RARE' | 'LEGENDARY' {
  return isMaxLevel && unlocked ? 'LEGENDARY' : rarity;
}

/** Locked entries always use locked chrome — no gold while still locked. */
export function trophyFrameLocked(locked: boolean): boolean {
  return locked;
}
