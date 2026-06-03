import { PlayerAvatar } from '@/components';
import type { BasicUser } from '@/types';

function lineName(p: BasicUser): string {
  return [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.id;
}

type LiveCourtEndPlayerLabelProps = {
  players: BasicUser[];
  matchDoubles?: boolean;
};

export function LiveCourtEndPlayerLabel({ players, matchDoubles = false }: LiveCourtEndPlayerLabelProps) {
  const roster = matchDoubles ? players.slice(0, 2) : players.slice(0, 1);
  if (!roster.length) return null;

  return (
    <div className="flex max-w-[6.5rem] flex-col items-center gap-1">
      {roster.map((p, i) => (
        <div key={p.id ?? i} className="flex min-w-0 items-center gap-1.5">
          <PlayerAvatar
            player={p}
            showName={false}
            inlineFace
            inlineFacePlain
            inlineFaceSize="sm"
            asDiv
            subscribePresence={false}
          />
          <span className="truncate text-[10px] font-semibold text-gray-800 dark:text-gray-100">{lineName(p)}</span>
        </div>
      ))}
    </div>
  );
}
