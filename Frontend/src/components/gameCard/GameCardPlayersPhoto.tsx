import { memo } from 'react';

interface GameCardPlayersPhotoProps {
  url: string;
  className?: string;
}

/** Main game photo as a small thumbnail at the start of the ticket footer. */
function GameCardPlayersPhotoInner({ url, className = '' }: GameCardPlayersPhotoProps) {
  return (
    <div
      className={`size-10 shrink-0 overflow-hidden rounded-xl ring-1 ring-black/5 dark:ring-white/10 ${className}`}
    >
      <img
        src={url}
        alt=""
        className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
        loading="lazy"
      />
    </div>
  );
}

export const GameCardPlayersPhoto = memo(GameCardPlayersPhotoInner);
