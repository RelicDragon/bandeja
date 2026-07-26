import { useMemo } from 'react';
import { TrophyCelebrationSheet } from '@/components/trophies/TrophyCelebrationSheet';
import type { TrophiesPayload } from '@/types/trophies';

type TrophyPendingCelebrationHostProps = {
  trophies: TrophiesPayload | null | undefined;
  isOwn: boolean;
  /** True when host mounts inside another Vaul drawer (player card). */
  nested?: boolean;
};

/** Celebrate Rare/Legendary unlocks delivered via profile payload (e.g. league season FINAL). */
export function TrophyPendingCelebrationHost({
  trophies,
  isOwn,
  nested = false,
}: TrophyPendingCelebrationHostProps) {
  const pendingCelebrations = trophies?.pendingCelebrations;
  const pending = useMemo(() => {
    if (!pendingCelebrations?.length) return null;
    return pendingCelebrations.map((row) => ({
      definitionId: row.definitionId,
      rarity: row.rarity,
      artKey: row.artKey,
      titleKey: row.titleKey,
      achievementId: row.achievementId,
      ...(row.place != null ? { place: row.place } : {}),
      sport: row.sport,
    }));
  }, [pendingCelebrations]);

  if (!isOwn || !pending?.length) return null;

  return <TrophyCelebrationSheet pending={pending} nested={nested} />;
}
