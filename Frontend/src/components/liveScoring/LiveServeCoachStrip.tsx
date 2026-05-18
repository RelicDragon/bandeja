import { ArrowDown, ArrowUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BasicUser } from '@/types';
import type { LiveTeamSide, ServeGuideSnapshot } from '@/utils/liveScoring';
import { CourtFlipBounceArrow } from '@/components/liveScoring/CourtFlipBounceArrow';
import { ServeCourtSchema } from '@/components/liveScoring/ServeCourtSchema';

function ChangeEndsBounceArrow({ direction }: { direction: 'up' | 'down' }) {
  const Icon = direction === 'up' ? ArrowUp : ArrowDown;
  const iconClass = 'shrink-0 text-sky-950 dark:text-sky-100';
  const sign = direction === 'up' ? 1 : -1;

  return (
    <CourtFlipBounceArrow axis="y" sign={sign} className="inline-flex">
      <Icon size={12} strokeWidth={2.5} className={iconClass} />
    </CourtFlipBounceArrow>
  );
}

function ChangeEndsSideTag({ label, side }: { label: string; side: 'left' | 'right' }) {
  return (
    <div
      aria-hidden
      className="flex w-5 shrink-0 flex-col items-center justify-between self-stretch rounded-2xl border border-sky-300 bg-sky-50 py-2 dark:border-sky-800 dark:bg-sky-950/40 sm:w-[1.35rem]"
    >
      <ChangeEndsBounceArrow direction="up" />
      <span
        className={`whitespace-nowrap text-[10px] font-semibold leading-none text-sky-950 dark:text-sky-100 ${
          side === 'left' ? '-rotate-90' : 'rotate-90'
        }`}
      >
        {label}
      </span>
      <ChangeEndsBounceArrow direction="down" />
    </div>
  );
}

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

  return (
    <div className="flex w-full items-stretch justify-center gap-1.5">
      {snapshot.changeEndsBeforeNextPoint ? <ChangeEndsSideTag side="left" label={changeEndsLabel} /> : null}
      <ServeCourtSchema
        courtSide={snapshot.courtSide}
        serverTeam={snapshot.serverTeam}
        serverPlayerIndex={snapshot.serverPlayerIndex}
        motionToken={snapshot.motionToken}
        teamAPlayers={teamAPlayers}
        teamBPlayers={teamBPlayers}
        courtEndsSwapped={snapshot.courtEndsSwapped}
        courtTeamASidesMirrored={snapshot.courtTeamASidesMirrored}
        courtTeamBSidesMirrored={snapshot.courtTeamBSidesMirrored}
        className="h-[13.5rem] w-[6.75rem] max-w-full sm:h-[15rem] sm:w-[7.5rem]"
        aria-label={ariaLabel}
      />
      {snapshot.changeEndsBeforeNextPoint ? <ChangeEndsSideTag side="right" label={changeEndsLabel} /> : null}
    </div>
  );
};
