import type { TrophyRarity } from '@/types/trophies';

export const rarityLabelKey = (rarity: TrophyRarity): string => {
  if (rarity === 'LEGENDARY') return 'trophies.rarity.legendary';
  if (rarity === 'RARE') return 'trophies.rarity.rare';
  return 'trophies.rarity.common';
};

/** Only rare/legendary show a rarity tag; common is unlabeled. */
export function showsRarityTag(rarity: TrophyRarity): boolean {
  return rarity === 'RARE' || rarity === 'LEGENDARY';
}

/** Outer gradient stops used by TrophyRarityFrame (`bg-gradient-to-br`). */
export function rarityFrameClass(rarity: TrophyRarity, locked: boolean): string {
  if (locked) {
    return 'from-gray-300 via-gray-200 to-gray-400 ring-gray-300/40 dark:from-gray-600 dark:via-gray-700 dark:to-gray-800 dark:ring-gray-600/30';
  }
  if (rarity === 'LEGENDARY') {
    return 'from-amber-200 via-yellow-400 to-orange-500 ring-amber-400/50 dark:from-amber-300 dark:via-yellow-500 dark:to-amber-700 dark:ring-amber-400/35';
  }
  if (rarity === 'RARE') {
    return 'from-sky-300 via-cyan-400 to-indigo-500 ring-cyan-400/45 dark:from-sky-400 dark:via-cyan-500 dark:to-indigo-700 dark:ring-cyan-400/30';
  }
  return 'from-emerald-300 via-teal-400 to-cyan-500 ring-emerald-400/40 dark:from-emerald-500 dark:via-teal-500 dark:to-cyan-700 dark:ring-emerald-400/25';
}

export function rarityTextClass(rarity: TrophyRarity, locked: boolean): string {
  if (locked) return 'text-gray-400 dark:text-gray-500';
  if (rarity === 'LEGENDARY') return 'text-amber-700 dark:text-amber-300';
  if (rarity === 'RARE') return 'text-cyan-700 dark:text-cyan-300';
  return 'text-emerald-700 dark:text-emerald-300';
}

export function rarityBadgeClass(rarity: TrophyRarity, locked = false): string {
  if (locked) {
    return 'bg-gray-100 text-gray-500 ring-gray-300/70 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-600/50';
  }
  if (rarity === 'LEGENDARY') {
    return 'bg-amber-100 text-amber-900 ring-amber-300/80 dark:bg-amber-950/70 dark:text-amber-100 dark:ring-amber-500/40';
  }
  if (rarity === 'RARE') {
    return 'bg-cyan-100 text-cyan-900 ring-cyan-300/80 dark:bg-cyan-950/70 dark:text-cyan-100 dark:ring-cyan-500/40';
  }
  return 'bg-emerald-100 text-emerald-900 ring-emerald-300/70 dark:bg-emerald-950/60 dark:text-emerald-100 dark:ring-emerald-500/35';
}

export function rarityGlowClass(rarity: TrophyRarity, locked: boolean): string {
  if (locked) return '';
  if (rarity === 'LEGENDARY') return 'shadow-[0_0_20px_rgba(245,158,11,0.4)]';
  if (rarity === 'RARE') return 'shadow-[0_0_18px_rgba(34,211,238,0.32)]';
  return 'shadow-[0_0_14px_rgba(16,185,129,0.25)]';
}

export function rarityAuraClass(rarity: TrophyRarity): string {
  if (rarity === 'LEGENDARY') {
    return 'from-amber-400/50 via-yellow-300/30 to-transparent';
  }
  if (rarity === 'RARE') {
    return 'from-cyan-400/45 via-indigo-400/25 to-transparent';
  }
  return 'from-emerald-400/40 via-teal-300/20 to-transparent';
}

export function rarityCelebrationShell(rarity: TrophyRarity): string {
  if (rarity === 'LEGENDARY') {
    return 'border-amber-300/50 from-amber-50 via-white to-orange-50 dark:border-amber-500/30 dark:from-amber-950/80 dark:via-gray-950 dark:to-orange-950/50';
  }
  if (rarity === 'RARE') {
    return 'border-cyan-300/50 from-sky-50 via-white to-indigo-50 dark:border-cyan-500/30 dark:from-cyan-950/70 dark:via-gray-950 dark:to-indigo-950/50';
  }
  return 'border-emerald-300/50 from-emerald-50 via-white to-teal-50 dark:border-emerald-500/30 dark:from-emerald-950/70 dark:via-gray-950 dark:to-teal-950/40';
}
