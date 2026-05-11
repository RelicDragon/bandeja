import { useTranslation } from 'react-i18next';
import type { BasicUser } from '@/types';
import type { LiveTeamSide, ServeGuideSnapshot } from '@/utils/liveScoring';
import { ServeCourtSchema } from '@/components/liveScoring/ServeCourtSchema';

type LiveServeCoachStripProps = {
  snapshot: ServeGuideSnapshot;
  teamAPlayers: BasicUser[];
  teamBPlayers: BasicUser[];
};

export const LiveServeCoachStrip = ({ snapshot, teamAPlayers, teamBPlayers }: LiveServeCoachStripProps) => {
  const { t } = useTranslation();

  const serveFromLabel = (s: ServeGuideSnapshot['courtSide']) =>
    s === 'rightDeuce' ? t('gameDetails.liveScoring.serveFromRight') : t('gameDetails.liveScoring.serveFromLeft');

  const teamShort = (team: LiveTeamSide) =>
    team === 'teamA' ? t('gameDetails.liveScoring.teamShortA') : t('gameDetails.liveScoring.teamShortB');

  if (snapshot.changeEndsBeforeNextPoint) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
        {t('gameDetails.liveScoring.changeEnds')}
      </div>
    );
  }

  const slot =
    snapshot.tieBreakServeSlot === 'serveOne'
      ? t('gameDetails.liveScoring.serveSlotOne')
      : snapshot.tieBreakServeSlot === 'serveTwo'
        ? t('gameDetails.liveScoring.serveSlotTwo')
        : null;

  const ariaLabel = [
    `${snapshot.serverDisplayName} (${teamShort(snapshot.serverTeam)})`,
    serveFromLabel(snapshot.courtSide),
    slot,
  ]
    .filter((x): x is string => Boolean(x?.length))
    .join('. ');

  return (
    <ServeCourtSchema
      courtSide={snapshot.courtSide}
      serverTeam={snapshot.serverTeam}
      serverPlayerIndex={snapshot.serverPlayerIndex}
      motionToken={snapshot.motionToken}
      teamAPlayers={teamAPlayers}
      teamBPlayers={teamBPlayers}
      className="h-[13.5rem] w-[6.75rem] max-w-full sm:h-[15rem] sm:w-[7.5rem]"
      aria-label={ariaLabel}
    />
  );
};
