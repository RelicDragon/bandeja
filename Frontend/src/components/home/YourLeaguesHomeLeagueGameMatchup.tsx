import { useTranslation } from 'react-i18next';
import { PlayerAvatar } from '@/components';
import type { BasicUser } from '@/types';
import { formatFixtureMatrixPlayerName } from '@/utils/leagueFixtureMatrix';
import {
  getLeagueHomeOpponentRowDisplay,
  type LeagueHomeGameMatchup,
} from '@/utils/leagueHomeGameMatchup';

const MATCHUP_BLOCK =
  'rounded-md border border-indigo-200/70 bg-indigo-50/60 dark:border-indigo-800/60 dark:bg-indigo-950/40';
const MATCHUP_BLOCK_DIVIDER = 'border-t border-indigo-200/70 dark:border-indigo-800/60';
const MATCHUP_AVATAR_RING = 'ring-indigo-50 dark:ring-indigo-950/40';
const MATCHUP_ROW_TEXT =
  'min-w-0 truncate text-[11px] font-semibold leading-snug text-gray-800 dark:text-gray-100';
const MATCHUP_VS_TAG =
  'rounded border border-indigo-200 bg-white px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-indigo-600 dark:border-indigo-700 dark:bg-gray-900 dark:text-indigo-400';

function formatUsersLabel(users: BasicUser[]): string {
  return users.map((u) => formatFixtureMatrixPlayerName(u)).filter(Boolean).join(', ');
}

const WITH_LABEL_CLASS = 'font-semibold text-gray-400 dark:text-gray-500';

function WithLabel({ children }: { children: string }) {
  return <span className={WITH_LABEL_CLASS}>{children}</span>;
}

function renderOpponentRowText(
  opponents: BasicUser[],
  opponentTeamName: string | undefined,
  withWord: string
) {
  const display = getLeagueHomeOpponentRowDisplay(opponents, opponentTeamName);
  if (display.kind === 'teamName') return display.label;
  if (!display.primary) return '';
  if (display.partners.length === 0) return display.primary;
  return (
    <>
      {display.primary} <WithLabel>{withWord}</WithLabel> {display.partners.join(', ')}
    </>
  );
}

function InlineFaceStack({ users }: { users: BasicUser[] }) {
  if (users.length === 0) return null;
  return (
    <div className="flex shrink-0 items-center -space-x-1.5" aria-hidden>
      {users.map((u, i) => (
        <span
          key={u.id}
          className={`relative flex shrink-0 rounded-full ring-2 ${MATCHUP_AVATAR_RING}`}
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
  const withNames = formatUsersLabel(matchup.teammates);
  const youWord = t('home.leagueGameYouLabel', { defaultValue: 'You' });
  const withWord = t('home.leagueGameWithLabel');
  const vsWord = t('gameDetails.fixtureVsShort', { defaultValue: 'vs' });
  const opponentRowText = renderOpponentRowText(matchup.opponents, matchup.opponentTeamName, withWord);
  const hasWith = matchup.teammates.length > 0;
  const hasVs = matchup.opponents.length > 0 || !!matchup.opponentTeamName;
  const sideUsers = [matchup.self, ...matchup.teammates];

  return (
    <div className={`w-full min-w-0 ${MATCHUP_BLOCK}`}>
      <div className="flex min-w-0 items-center gap-1.5 px-1.5 py-1">
        <InlineFaceStack users={sideUsers} />
        <p className={MATCHUP_ROW_TEXT}>
          {youWord}
          {hasWith && (
            <>
              {' '}
              <WithLabel>{withWord}</WithLabel> {withNames}
            </>
          )}
        </p>
      </div>
      {hasVs && (
        <div className="relative">
          <span
            className={`absolute right-3 top-0 z-10 -translate-y-1/2 ${MATCHUP_VS_TAG}`}
            aria-hidden
          >
            {vsWord}
          </span>
          <div className={`flex min-w-0 items-center gap-1.5 border-t px-1.5 py-1 ${MATCHUP_BLOCK_DIVIDER}`}>
            <InlineFaceStack users={matchup.opponents} />
            <p className={MATCHUP_ROW_TEXT}>{opponentRowText}</p>
          </div>
        </div>
      )}
    </div>
  );
}
