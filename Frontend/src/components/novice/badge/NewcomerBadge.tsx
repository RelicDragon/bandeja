import { Sprout } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isNewcomerUser, type NoviceUserFields } from '@shared/novice';
import { noviceRankNameKey } from '@/components/novice/celebration/noviceCelebrationMeta';

export type NewcomerBadgeSize = 'xs' | 'sm' | 'md';

const SIZE: Record<NewcomerBadgeSize, { box: string; icon: number }> = {
  xs: { box: 'w-4 h-4', icon: 9 },
  sm: { box: 'w-5 h-5', icon: 11 },
  md: { box: 'w-6 h-6', icon: 13 },
};

/**
 * PRD 358 — the 🌱 corner glyph. Rendered only inside `PlayerAvatar`'s own
 * badge layer (same disc + white border as the owner crown); never as a ring.
 */
export function NewcomerAvatarGlyph({
  size,
  positionClassName,
}: {
  size: NewcomerBadgeSize;
  positionClassName: string;
}) {
  const { t } = useTranslation();
  const s = SIZE[size];
  return (
    <span
      data-testid="newcomer-badge"
      role="img"
      aria-label={t('novice.badge.newcomer')}
      title={t('novice.badge.newcomer')}
      className={`absolute ${positionClassName} ${s.box} z-20 flex items-center justify-center rounded-full border-2 border-white bg-emerald-500 dark:border-gray-900 dark:bg-emerald-600`}
    >
      <Sprout size={s.icon} className="text-white" strokeWidth={2.5} aria-hidden />
    </span>
  );
}

/** Player card header pill: "🌱 Newcomer · Rookie". */
export function NewcomerRankPill({ user }: { user: NoviceUserFields | null | undefined }) {
  const { t } = useTranslation();
  if (!isNewcomerUser(user)) return null;
  const rank = user?.noviceRank ?? 0;
  return (
    <span
      data-testid="newcomer-rank-pill"
      className="inline-flex w-fit items-center gap-1.5 rounded-full border-2 border-white bg-emerald-500 px-3 py-1 text-sm font-semibold text-white dark:border-gray-900 dark:bg-emerald-600"
      style={{ boxShadow: '0 6px 15px rgba(0, 0, 0, 0.4), 0 2px 6px rgba(0, 0, 0, 0.2)' }}
    >
      <Sprout size={14} className="text-white" aria-hidden />
      <span>
        {rank > 0
          ? t('novice.badge.cardLabel', { rank: t(noviceRankNameKey(rank)) })
          : t('novice.badge.newcomer')}
      </span>
    </span>
  );
}
