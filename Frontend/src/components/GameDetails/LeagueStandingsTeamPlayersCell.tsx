import { PlayerAvatar } from '@/components/PlayerAvatar';
import type { LeagueStanding } from '@/api/leagues';

type LeagueTeamPlayer = NonNullable<NonNullable<LeagueStanding['leagueTeam']>['players']>[number];

function playerDisplayName(player: LeagueTeamPlayer): string {
  return `${player.user?.firstName ?? ''} ${player.user?.lastName ?? ''}`.trim();
}

export function LeagueStandingsTeamPlayersCell({
  players,
}: {
  players: LeagueTeamPlayer[] | undefined;
}) {
  const list = players?.slice(0, 3) ?? [];
  if (list.length === 0) {
    return <span className="text-sm text-gray-500">—</span>;
  }

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {list.map((player) => {
        const name = playerDisplayName(player);
        return (
          <div key={player.id} className="flex min-w-0 items-center gap-1.5">
            <PlayerAvatar
              player={player.user}
              showName={false}
              fullHideName
              inlineFace
              inlineFacePlain
              inlineFaceSize="sm"
              subscribePresence={false}
              asDiv
            />
            <span className="min-w-0 truncate text-xs leading-tight text-gray-900 dark:text-white">
              {name || '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
