import { Trans, useTranslation } from 'react-i18next';
import { PlayerAvatar } from '@/components';
import type { BasicUser } from '@/types';
import type { ServeGuideSnapshot } from '@/utils/liveScoring';
import { serveAvatarHighlightWrap } from './serveCourtHighlight';
import { LiveServeSideArrow } from './LiveServeSideArrow';

type LiveServeServerLineProps = {
  snapshot: ServeGuideSnapshot;
  teamAPlayers: BasicUser[];
  teamBPlayers: BasicUser[];
  /** Flush footer on the score panel above. */
  attached?: boolean;
};

function serverPlayer(
  snapshot: ServeGuideSnapshot,
  teamAPlayers: BasicUser[],
  teamBPlayers: BasicUser[]
): BasicUser | null {
  const players = snapshot.serverTeam === 'teamA' ? teamAPlayers : teamBPlayers;
  const n = players.length;
  if (!n) return null;
  const idx = n <= 1 ? 0 : Math.min(Math.max(0, snapshot.serverPlayerIndex), n - 1);
  return players[idx] ?? players[0] ?? null;
}

export function LiveServeServerLine({ snapshot, teamAPlayers, teamBPlayers, attached }: LiveServeServerLineProps) {
  const { t } = useTranslation();
  const player = serverPlayer(snapshot, teamAPlayers, teamBPlayers);
  const fromRight = snapshot.courtSide === 'rightDeuce';
  const lineKey = fromRight
    ? 'gameDetails.liveScoring.serverServesFromRightLine'
    : 'gameDetails.liveScoring.serverServesFromLeftLine';
  const a11yKey = fromRight
    ? 'gameDetails.liveScoring.serverServesFromRightA11y'
    : 'gameDetails.liveScoring.serverServesFromLeftA11y';
  const slot =
    snapshot.tieBreakServeSlot === 'serveOne'
      ? t('gameDetails.liveScoring.serveSlotOne')
      : snapshot.tieBreakServeSlot === 'serveTwo'
        ? t('gameDetails.liveScoring.serveSlotTwo')
        : null;

  const a11y = t(a11yKey, { name: snapshot.serverDisplayName });

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={a11y}
      className={
        attached
          ? 'flex w-full justify-center overflow-visible rounded-b-xl border-t border-zinc-200/80 bg-zinc-50 px-2 py-1.5 dark:border-zinc-700/80 dark:bg-zinc-900 sm:px-3'
          : 'mx-auto flex w-fit max-w-full justify-center'
      }
    >
      <div
        className={
          attached
            ? 'flex max-w-full items-center gap-1.5'
            : 'flex max-w-full items-center gap-1.5 rounded-lg border border-zinc-200/70 bg-zinc-50/90 px-2 py-1 dark:border-zinc-700/70 dark:bg-zinc-900/50'
        }
      >
        <div className={serveAvatarHighlightWrap(true, 'xs', 'ring')}>
          <PlayerAvatar
            player={player}
            showName={false}
            superTiny
            asDiv
            subscribePresence={false}
          />
        </div>
        <p className="min-w-0 text-center text-[11px] leading-tight sm:text-xs">
          <Trans
            i18nKey={lineKey}
            values={{ name: snapshot.serverDisplayName }}
            components={{
              name: <span key="name" className="font-semibold text-amber-800 dark:text-amber-200" />,
              side: <span key="side" className="font-semibold text-amber-700 dark:text-amber-300" />,
            }}
          />
          {slot ? (
            <span className="ml-1 inline-flex align-middle rounded bg-zinc-200/90 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
              {slot}
            </span>
          ) : null}
        </p>
        <LiveServeSideArrow courtSide={snapshot.courtSide} />
      </div>
    </div>
  );
}
