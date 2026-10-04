import { memo, useState } from 'react';

interface GameCardAvatarProps {
  url: string;
  /** `tile`: app-icon square beside the title. `chip`: small mark in the eyebrow for narrow cards. */
  variant?: 'tile' | 'chip';
  className?: string;
}

const VARIANT_CLASS = {
  tile: 'mt-0.5 size-11 rounded-[12px]',
  chip: 'size-[18px] rounded-[5px]',
} as const;

/**
 * The game's avatar. Decorative — the title next to it already names the game —
 * and it disappears on a broken URL instead of leaving a hole.
 */
function GameCardAvatarInner({ url, variant = 'tile', className = '' }: GameCardAvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (failedUrl === url) return null;
  const shape = VARIANT_CLASS[variant];
  return (
    <span className={`relative shrink-0 overflow-hidden bg-gray-100 dark:bg-gray-800 ${shape} ${className}`}>
      <img
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setFailedUrl(url)}
        className="h-full w-full object-cover"
      />
      <span
        className={`pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/[0.06] dark:ring-white/10 ${shape}`}
        aria-hidden
      />
    </span>
  );
}

export const GameCardAvatar = memo(GameCardAvatarInner);
