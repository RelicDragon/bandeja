import { useEffect, useState } from 'react';
import type { StoryResultMatchPlayer } from '@/api/stories';
import { userAvatarTinyUrlFromStandard } from '@/utils/userAvatarTinyUrl';

type GameResultStoryPlayerChipProps = {
  player: StoryResultMatchPlayer;
  highlighted: boolean;
};

function initialsFromName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export function GameResultStoryPlayerChip({ player, highlighted }: GameResultStoryPlayerChipProps) {
  const tinyUrl = userAvatarTinyUrlFromStandard(player.avatar);
  const [tinyFailed, setTinyFailed] = useState(false);

  useEffect(() => {
    setTinyFailed(false);
  }, [player.userId, player.avatar]);

  const avatarSrc = tinyUrl && !tinyFailed ? tinyUrl : player.avatar ?? '';
  const initials = initialsFromName(player.displayName);

  return (
    <span
      className={`inline-flex min-w-0 max-w-full items-center gap-1.5 ${
        highlighted
          ? 'rounded-lg bg-white/20 py-0.5 pl-0.5 pr-2 ring-1 ring-white/35 shadow-[0_0_12px_rgba(255,255,255,0.2)]'
          : ''
      }`}
    >
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-600 text-[9px] font-bold text-white ${
          highlighted ? 'ring-2 ring-yellow-200/80' : 'ring-1 ring-white/25'
        }`}
      >
        {avatarSrc ? (
          <img
            src={avatarSrc}
            alt=""
            className="h-full w-full object-cover"
            onError={() => {
              if (tinyUrl && !tinyFailed) setTinyFailed(true);
            }}
          />
        ) : (
          initials
        )}
      </span>
      <span className={`truncate text-[12px] leading-none ${highlighted ? 'font-bold text-white' : 'text-white/90'}`}>
        {player.displayName}
      </span>
    </span>
  );
}
