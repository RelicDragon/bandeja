import type { ComponentType, Dispatch, SetStateAction } from 'react';
import { motion, useAnimation, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { BasicUser } from '@/types';
import type { LiveMatchCourtOrientation, LiveTeamSide } from '@/utils/liveScoring';
import { LiveCourtEndPlayerLabel } from './LiveCourtEndPlayerLabel';
import { LiveCourtSidesFlipRail } from './LiveCourtSidesFlipRail';
import { courtFlipMid, courtFlipSpring } from './liveCourtFlipMotion';
import { LIVE_COURT_FIT_CLASS } from './LiveCourtViewport';
import { LiveSetupCourtFrame } from './LiveSetupCourtFrame';
import type { ServeCourtProps } from './ServeCourtProps';

type LiveCourtSidesSetupProps = {
  teamAPlayers: BasicUser[];
  teamBPlayers: BasicUser[];
  CourtSchemaComponent?: ComponentType<ServeCourtProps> | null;
  courtAspect?: readonly [number, number] | null;
  serverTeam?: LiveTeamSide;
  serverPlayerIndex?: number;
  orientation: LiveMatchCourtOrientation;
  onOrientationChange: Dispatch<SetStateAction<LiveMatchCourtOrientation>>;
  showFlipRails?: boolean;
};

function teamAtSide(endsSwapped: boolean, side: 'left' | 'right'): LiveTeamSide {
  const aOnLeft = !endsSwapped;
  if (side === 'left') return aOnLeft ? 'teamA' : 'teamB';
  return aOnLeft ? 'teamB' : 'teamA';
}

export function LiveCourtSidesSetup({
  teamAPlayers,
  teamBPlayers,
  CourtSchemaComponent,
  courtAspect = null,
  serverTeam = 'teamA',
  serverPlayerIndex = 0,
  orientation,
  onOrientationChange,
  showFlipRails = true,
}: LiveCourtSidesSetupProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const courtAnim = useAnimation();
  const { endsSwapped } = orientation;
  const flipSides = async () => {
    const apply = () => onOrientationChange((prev) => ({ ...prev, endsSwapped: !prev.endsSwapped }));
    if (reduceMotion) {
      apply();
      return;
    }
    await courtAnim.start({ rotateY: 88, transition: courtFlipMid });
    apply();
    await courtAnim.start({ rotateY: 0, transition: courtFlipSpring });
  };

  const court =
    CourtSchemaComponent &&
    (courtAspect ? (
      <LiveSetupCourtFrame aspect={courtAspect}>
        <CourtSchemaComponent
          endsSetup
          courtSide="rightDeuce"
          serverTeam={serverTeam}
          serverPlayerIndex={serverPlayerIndex}
          motionToken="setup"
          teamAPlayers={teamAPlayers}
          teamBPlayers={teamBPlayers}
          courtEndsSwapped={endsSwapped}
          className={LIVE_COURT_FIT_CLASS}
          aria-label={t('gameDetails.liveScoring.courtEndsA11y')}
        />
      </LiveSetupCourtFrame>
    ) : (
      <CourtSchemaComponent
        endsSetup
        courtSide="rightDeuce"
        serverTeam={serverTeam}
        serverPlayerIndex={serverPlayerIndex}
        motionToken="setup"
        teamAPlayers={teamAPlayers}
        teamBPlayers={teamBPlayers}
        courtEndsSwapped={endsSwapped}
        aria-label={t('gameDetails.liveScoring.courtEndsA11y')}
      />
    ));

  if (!showFlipRails) {
    if (!court) return null;
    return (
      <div className="relative mt-4 flex justify-center">
        <div className="w-full max-w-[12rem] [perspective:640px]">
          <motion.div animate={courtAnim} className="origin-center [transform-style:preserve-3d]">
            {court}
          </motion.div>
        </div>
      </div>
    );
  }

  const leftTeam = teamAtSide(endsSwapped, 'left');
  const rightTeam = teamAtSide(endsSwapped, 'right');
  const playersForTeam = (team: LiveTeamSide) => (team === 'teamA' ? teamAPlayers : teamBPlayers);

  return (
    <div className="relative mt-4">
      <div className="flex flex-col items-center gap-2">
        <div className="flex w-full max-w-[16rem] items-stretch justify-center gap-2">
          <div className="flex w-[4.5rem] shrink-0 flex-col items-center justify-center gap-2">
            <LiveCourtEndPlayerLabel players={playersForTeam(leftTeam)} matchDoubles={false} />
            <LiveCourtSidesFlipRail side="left" onFlip={() => void flipSides()} />
          </div>
          {court ? (
            <div className="min-w-0 flex-1 [perspective:640px]">
              <motion.div animate={courtAnim} className="origin-center [transform-style:preserve-3d]">
                {court}
              </motion.div>
            </div>
          ) : null}
          <div className="flex w-[4.5rem] shrink-0 flex-col items-center justify-center gap-2">
            <LiveCourtEndPlayerLabel players={playersForTeam(rightTeam)} matchDoubles={false} />
            <LiveCourtSidesFlipRail side="right" onFlip={() => void flipSides()} />
          </div>
        </div>
      </div>
    </div>
  );
}
