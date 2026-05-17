import { Loader2, Trash2 } from 'lucide-react';
import { PlayerAvatar } from '@/components';
import { LeagueStanding } from '@/api/leagues';
import type { BasicUser } from '@/types';

function playerDisplayName(user: BasicUser): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
}

function ParticipantPlayerSlot({ user }: { user: BasicUser }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <PlayerAvatar player={user} showName={false} fullHideName extrasmall />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium leading-snug text-gray-900 dark:text-white line-clamp-2">
          {playerDisplayName(user)}
        </p>
        {user.verbalStatus ? (
          <p className="verbal-status mt-0.5 line-clamp-1 text-[10px]">{user.verbalStatus}</p>
        ) : null}
      </div>
    </div>
  );
}

interface LeagueGroupParticipantRowProps {
  participant: LeagueStanding;
  index: number;
  onRemove: () => void;
  removing?: boolean;
}

export const LeagueGroupParticipantRow = ({
  participant,
  index,
  onRemove,
  removing = false,
}: LeagueGroupParticipantRowProps) => {
  const teamPlayers = participant.leagueTeam?.players.filter((p) => p.user) ?? [];

  return (
    <div className="flex items-stretch overflow-hidden rounded-xl border border-gray-200/90 bg-gray-50/90 dark:border-gray-700/70 dark:bg-gray-800/45">
      <div
        className="flex w-9 shrink-0 items-center justify-center border-r border-gray-200/90 bg-emerald-500/10 dark:border-gray-700/70 dark:bg-emerald-500/15"
        aria-hidden
      >
        <span className="text-xs font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
          {index + 1}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 p-2.5">
        {participant.user ? (
          <ParticipantPlayerSlot user={participant.user} />
        ) : teamPlayers.length > 0 ? (
          teamPlayers.map((tp) => <ParticipantPlayerSlot key={tp.id} user={tp.user} />)
        ) : null}
      </div>

      <div className="flex shrink-0 items-center border-l border-gray-200/90 px-2 dark:border-gray-700/70">
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          className="rounded-lg p-1.5 text-red-600 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:hover:bg-red-900/20"
          aria-label="Remove"
        >
          {removing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      </div>
    </div>
  );
};
