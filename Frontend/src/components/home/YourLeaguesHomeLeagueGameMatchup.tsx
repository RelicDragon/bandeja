import { useTranslation } from 'react-i18next';
import { PlayerAvatar } from '@/components';
import type { BasicUser } from '@/types';
import { formatFixtureMatrixPlayerName } from '@/utils/leagueFixtureMatrix';
import type { LeagueHomeGameMatchup } from '@/utils/leagueHomeGameMatchup';

function formatUsersLabel(users: BasicUser[]): string {
  return users.map((u) => formatFixtureMatrixPlayerName(u)).filter(Boolean).join(', ');
}

function InlineFaceStack({ users }: { users: BasicUser[] }) {
  if (users.length === 0) return null;
  return (
    <div className="flex shrink-0 items-center -space-x-1.5" aria-hidden>
      {users.map((u, i) => (
        <span
          key={u.id}
          className="relative flex shrink-0 rounded-full ring-2 ring-white dark:ring-gray-900"
          style={{ zIndex: i + 1 }}
        >
          <PlayerAvatar
            player={u}
            inlineFace
            inlineFacePlain
            inlineFaceFlatStack
            inlineFaceSize="sm"
            showName={false}
            subscribePresence={false}
            asDiv
          />
        </span>
      ))}
    </div>
  );
}

interface YourLeaguesHomeLeagueGameMatchupProps {
  matchup: LeagueHomeGameMatchup;
}

export function YourLeaguesHomeLeagueGameMatchup({ matchup }: YourLeaguesHomeLeagueGameMatchupProps) {
  const { t } = useTranslation();
  const withLabel = formatUsersLabel(matchup.teammates);
  const vsLabel = matchup.opponentTeamName || formatUsersLabel(matchup.opponents);
  const vsShort = t('gameDetails.fixtureVsShort', { defaultValue: 'vs' });

  return (
    <div className="mt-1 flex min-w-0 flex-col gap-1">
      {matchup.teammates.length > 0 && (
        <div className="flex min-w-0 items-center gap-1.5">
          <InlineFaceStack users={matchup.teammates} />
          <p className="min-w-0 truncate text-[11px] leading-snug text-gray-600 dark:text-gray-300">
            <span className="font-semibold text-gray-400 dark:text-gray-500">
              {t('home.leagueGameWithLabel')}
            </span>{' '}
            {withLabel}
          </p>
        </div>
      )}
      {(matchup.opponents.length > 0 || vsLabel) && (
        <div className="flex min-w-0 items-center gap-1.5 rounded-md border border-indigo-100/80 bg-indigo-50/50 px-1.5 py-1 dark:border-indigo-900/50 dark:bg-indigo-950/30">
          <InlineFaceStack users={matchup.opponents} />
          <p className="min-w-0 truncate text-[11px] font-semibold leading-snug text-gray-800 dark:text-gray-100">
            <span className="mr-1 text-[10px] font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
              {vsShort}
            </span>
            {vsLabel}
          </p>
        </div>
      )}
    </div>
  );
}
