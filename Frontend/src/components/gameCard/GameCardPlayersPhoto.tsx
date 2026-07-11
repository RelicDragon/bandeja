import { memo } from 'react';

interface GameCardPlayersPhotoProps {
  url: string;
  className?: string;
}

function GameCardPlayersPhotoInner({ url, className = '' }: GameCardPlayersPhotoProps) {
  return (
    <div
      className={`size-[7rem] shrink-0 overflow-hidden rounded-xl shadow-sm ring-1 ring-gray-200 transition-shadow duration-300 group-hover:shadow-md dark:ring-gray-700 ${className}`}
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
