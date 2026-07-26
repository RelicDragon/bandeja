import type { ReactNode } from 'react';
import type { TrophyRarity } from '@/types/trophies';
import {
  rarityFrameClass,
  rarityGlowClass,
} from '@/components/trophies/trophyRarityStyles';

type TrophyRarityFrameProps = {
  rarity: TrophyRarity;
  locked?: boolean;
  className?: string;
  innerClassName?: string;
  children: ReactNode;
};

/** Gradient rarity ring with solid inner surface — keeps art readable. */
export function TrophyRarityFrame({
  rarity,
  locked = false,
  className = '',
  innerClassName = '',
  children,
}: TrophyRarityFrameProps) {
  const hasRounded = /\brounded-/.test(className);

  return (
    <div
      className={`${hasRounded ? '' : 'rounded-2xl'} ${rarityGlowClass(rarity, locked)} ${className}`}
    >
      <div
        className={`h-full w-full overflow-hidden bg-gradient-to-br p-[1.5px] ${
          hasRounded ? 'rounded-[inherit]' : 'rounded-2xl'
        } ${rarityFrameClass(rarity, locked)}`}
      >
        <div
          className={`flex h-full w-full items-center justify-center ${
            locked
              ? 'bg-gray-100/95 dark:bg-gray-900/90'
              : 'bg-white/95 dark:bg-gray-950/85'
          } ${innerClassName}`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
