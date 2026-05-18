import { useTranslation } from 'react-i18next';
import { PlayerAvatar } from '@/components';
import type { BasicUser } from '@/types';
import type { ServeGuideSnapshot } from '@/utils/liveScoring';
import { LiveServeBallIndicator } from './LiveServeBallIndicator';

type LiveServeServerLineProps = {
  snapshot: ServeGuideSnapshot;
  teamAPlayers: BasicUser[];
  teamBPlayers: BasicUser[];
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

export function LiveServeServerLine({ snapshot, teamAPlayers, teamBPlayers }: LiveServeServerLineProps) {
  const { t } = useTranslation();
  const player = serverPlayer(snapshot, teamAPlayers, teamBPlayers);
  const sideLabel =
    snapshot.courtSide === 'rightDeuce'
      ? t('gameDetails.liveScoring.serveFromRight')
      : t('gameDetails.liveScoring.serveFromLeft');
  const slot =
    snapshot.tieBreakServeSlot === 'serveOne'
      ? t('gameDetails.liveScoring.serveSlotOne')
      : snapshot.tieBreakServeSlot === 'serveTwo'
        ? t('gameDetails.liveScoring.serveSlotTwo')
        : null;

  const a11y = t('gameDetails.liveScoring.serverServesFromA11y', {
    name: snapshot.serverDisplayName,
    side: sideLabel,
  });

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={a11y}
      className="mx-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-zinc-200/90 bg-gradient-to-br from-zinc-50 to-white px-4 py-3 shadow-sm ring-1 ring-black/[0.03] dark:border-zinc-700/90 dark:from-zinc-900/80 dark:to-zinc-900/40 dark:ring-white/[0.04]"
    >
      <PlayerAvatar
        player={player}
        showName={false}
        inlineFace
        inlineFacePlain
        inlineFaceSize="sm"
        asDiv
        subscribePresence={false}
      />
      <p className="min-w-0 flex-1 text-sm leading-snug sm:text-[0.9375rem]">
        <span className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {snapshot.serverDisplayName}
        </span>
        <span className="font-normal text-zinc-500 dark:text-zinc-400"> {t('gameDetails.liveScoring.servesFrom')} </span>
        <span className="font-semibold text-primary-700 dark:text-primary-300">{sideLabel}</span>
        {slot ? (
          <span className="ml-2 inline-flex align-middle rounded-md bg-zinc-200/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
            {slot}
          </span>
        ) : null}
      </p>
      <LiveServeBallIndicator inline />
    </div>
  );
}
