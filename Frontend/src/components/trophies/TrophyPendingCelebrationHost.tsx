import { TrophyCelebrationSheet } from '@/components/trophies/TrophyCelebrationSheet';
import type { TrophiesPayload } from '@/types/trophies';

type TrophyPendingCelebrationHostProps = {
  trophies: TrophiesPayload | null | undefined;
  isOwn: boolean;
};

/** Celebrate Rare/Legendary unlocks delivered via profile payload (e.g. league season FINAL). */
export function TrophyPendingCelebrationHost({
  trophies,
  isOwn,
}: TrophyPendingCelebrationHostProps) {
  if (!isOwn || !trophies?.pendingCelebrations?.length) return null;

  const pending = trophies.pendingCelebrations.map((row) => ({
    definitionId: row.definitionId,
    rarity: row.rarity,
    artKey: row.artKey,
    titleKey: row.titleKey,
    achievementId: row.achievementId,
    ...(row.place != null ? { place: row.place } : {}),
    sport: row.sport,
  }));

  return <TrophyCelebrationSheet pending={pending} />;
}
