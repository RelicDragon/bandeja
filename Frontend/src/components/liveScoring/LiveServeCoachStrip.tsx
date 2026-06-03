import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import type { BasicUser } from '@/types';
import type { LiveTeamSide, ServeGuideSnapshot } from '@/utils/liveScoring';
import { ChangeEndsSideTag } from './ChangeEndsSideMarkers';
import type { ServeCourtProps } from '@/components/liveScoring/ServeCourtProps';

type LiveServeCoachStripProps = {
  snapshot: ServeGuideSnapshot;
  teamAPlayers: BasicUser[];
  teamBPlayers: BasicUser[];
  CourtSchemaComponent?: ComponentType<ServeCourtProps> | null;
  matchDoubles?: boolean;
  /** Rally scoreboard already renders the full court — skip duplicate diagram. */
  hideCourt?: boolean;
};

export const LiveServeCoachStrip = ({
  snapshot,
  teamAPlayers,
  teamBPlayers,
  CourtSchemaComponent,
  matchDoubles = false,
  hideCourt = false,
}: LiveServeCoachStripProps) => {
  const { t } = useTranslation();

  const serveFromLabel = (s: ServeGuideSnapshot['courtSide']) =>
    s === 'rightDeuce' ? t('gameDetails.liveScoring.serveFromRight') : t('gameDetails.liveScoring.serveFromLeft');

  const teamShort = (team: LiveTeamSide) =>
    team === 'teamA' ? t('gameDetails.liveScoring.teamShortA') : t('gameDetails.liveScoring.teamShortB');

  const slot =
    snapshot.tieBreakServeSlot === 'serveOne'
      ? t('gameDetails.liveScoring.serveSlotOne')
      : snapshot.tieBreakServeSlot === 'serveTwo'
        ? t('gameDetails.liveScoring.serveSlotTwo')
        : null;

  const changeEndsLabel = t('gameDetails.liveScoring.changeEnds');

  const ariaLabel = [
    snapshot.changeEndsBeforeNextPoint ? changeEndsLabel : null,
    `${snapshot.serverDisplayName} (${teamShort(snapshot.serverTeam)})`,
    serveFromLabel(snapshot.courtSide),
    slot,
  ]
    .filter((x): x is string => Boolean(x?.length))
    .join('. ');

  if (hideCourt || !CourtSchemaComponent) {
    return null;
  }

  return (
    <div className="flex w-full items-center justify-center gap-1.5">
      {snapshot.changeEndsBeforeNextPoint ? <ChangeEndsSideTag side="left" label={changeEndsLabel} /> : null}
      <CourtSchemaComponent
        courtSide={snapshot.courtSide}
        serverTeam={snapshot.serverTeam}
        serverPlayerIndex={snapshot.serverPlayerIndex}
        motionToken={snapshot.motionToken}
        matchDoubles={matchDoubles}
        teamAPlayers={teamAPlayers}
        teamBPlayers={teamBPlayers}
        courtEndsSwapped={snapshot.courtEndsSwapped}
        courtTeamASidesMirrored={snapshot.courtTeamASidesMirrored}
        courtTeamBSidesMirrored={snapshot.courtTeamBSidesMirrored}
        aria-label={ariaLabel}
      />
      {snapshot.changeEndsBeforeNextPoint ? <ChangeEndsSideTag side="right" label={changeEndsLabel} /> : null}
    </div>
  );
};
