import { useTranslation } from 'react-i18next';
import type { TrophyRarity } from '@/types/trophies';
import { rarityBadgeClass, rarityLabelKey } from '@/components/trophies/trophyRarityStyles';

type TrophyRarityBadgeProps = {
  rarity: TrophyRarity;
  locked?: boolean;
  className?: string;
};

export function TrophyRarityBadge({
  rarity,
  locked = false,
  className = '',
}: TrophyRarityBadgeProps) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${rarityBadgeClass(rarity, locked)} ${className}`}
    >
      {t(rarityLabelKey(rarity))}
    </span>
  );
}
