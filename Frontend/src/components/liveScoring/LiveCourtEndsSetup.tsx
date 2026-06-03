import type { ComponentType, Dispatch, SetStateAction } from 'react';
import { motion, useAnimation, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { BasicUser } from '@/types';
import type { LiveMatchCourtOrientation, LiveTeamSide } from '@/utils/liveScoring';
import { LiveCourtEndsFlipRail } from './LiveCourtEndsFlipRail';
import { LiveCourtEndPlayerLabel } from './LiveCourtEndPlayerLabel';
import { LiveCourtTeamFlipButton } from './LiveCourtTeamFlipButton';
import { courtFlipMid, courtFlipSpring } from './liveCourtFlipMotion';
import { LIVE_COURT_FIT_CLASS } from './LiveCourtViewport';
import { LiveSetupCourtFrame } from './LiveSetupCourtFrame';
import type { ServeCourtProps } from './ServeCourtProps';

type LiveCourtEndsSetupProps = {
  teamAPlayers: BasicUser[];
  teamBPlayers: BasicUser[];
  CourtSchemaComponent?: ComponentType<ServeCourtProps> | null;
  courtAspect?: readonly [number, number] | null;
  matchDoubles?: boolean;
  showTeamSideFlip?: boolean;
  serverTeam?: LiveTeamSide;
  serverPlayerIndex?: number;
  orientation: LiveMatchCourtOrientation;
  onOrientationChange: Dispatch<SetStateAction<LiveMatchCourtOrientation>>;
  /** Called after a team's left/right mirror toggles (e.g. to swap serving player index). */
  onTeamSidesFlipped?: (team: LiveTeamSide) => void;
};

function teamAtEnd(endsSwapped: boolean, end: 'top' | 'bottom'): LiveTeamSide {
  if (end === 'top') return endsSwapped ? 'teamA' : 'teamB';
  return endsSwapped ? 'teamB' : 'teamA';
}

export function LiveCourtEndsSetup({
  teamAPlayers,
  teamBPlayers,
  CourtSchemaComponent,
  courtAspect = null,
  matchDoubles = false,
  showTeamSideFlip,
  serverTeam = 'teamA',
  serverPlayerIndex = 0,
  orientation,
  onOrientationChange,
  onTeamSidesFlipped,
}: LiveCourtEndsSetupProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const courtAnim = useAnimation();
  const teamSideFlip = showTeamSideFlip ?? matchDoubles;
  const { endsSwapped, teamASidesMirrored, teamBSidesMirrored } = orientation;
  const topTeam = teamAtEnd(endsSwapped, 'top');
  const bottomTeam = teamAtEnd(endsSwapped, 'bottom');
  const playersForTeam = (team: LiveTeamSide) => (team === 'teamA' ? teamAPlayers : teamBPlayers);

  const flipTeamSides = (team: LiveTeamSide) => {
    if (team === 'teamA') {
      onOrientationChange((prev) => ({ ...prev, teamASidesMirrored: !prev.teamASidesMirrored }));
    } else {
      onOrientationChange((prev) => ({ ...prev, teamBSidesMirrored: !prev.teamBSidesMirrored }));
    }
    onTeamSidesFlipped?.(team);
  };

  const flipEnds = async () => {
    const apply = () => onOrientationChange((prev) => ({ ...prev, endsSwapped: !prev.endsSwapped }));
    if (reduceMotion) {
      apply();
      return;
    }
    await courtAnim.start({ rotateX: 88, transition: courtFlipMid });
    apply();
    await courtAnim.start({ rotateX: 0, transition: courtFlipSpring });
  };

  const flipTeam = (team: LiveTeamSide) => {
    flipTeamSides(team);
  };

  const flipRailClass = 'absolute top-1/2 z-10 -translate-y-1/2';

  return (
    <div className="relative mt-4">
      <div className="mx-auto flex w-full min-w-0 max-w-md flex-col items-center gap-2 overflow-visible px-9">
        {teamSideFlip ? (
          <LiveCourtTeamFlipButton team={topTeam} onFlip={() => flipTeam(topTeam)} />
        ) : (
          <LiveCourtEndPlayerLabel players={playersForTeam(topTeam)} matchDoubles={matchDoubles} />
        )}
        {CourtSchemaComponent ? (
          <div className="relative w-full overflow-visible [perspective:640px]">
            <LiveCourtEndsFlipRail
              side="left"
              onFlip={() => void flipEnds()}
              className={`${flipRailClass} right-full mr-2`}
            />
            <motion.div animate={courtAnim} className="w-full origin-center [transform-style:preserve-3d]">
              {courtAspect ? (
                <LiveSetupCourtFrame aspect={courtAspect}>
                  <CourtSchemaComponent
                    endsSetup
                    matchDoubles={matchDoubles}
                    courtSide="rightDeuce"
                    serverTeam={serverTeam}
                    serverPlayerIndex={serverPlayerIndex}
                    motionToken="setup"
                    teamAPlayers={teamAPlayers}
                    teamBPlayers={teamBPlayers}
                    courtEndsSwapped={endsSwapped}
                    courtTeamASidesMirrored={teamASidesMirrored}
                    courtTeamBSidesMirrored={teamBSidesMirrored}
                    className={LIVE_COURT_FIT_CLASS}
                    aria-label={t('gameDetails.liveScoring.courtEndsA11y')}
                  />
                </LiveSetupCourtFrame>
              ) : (
                <CourtSchemaComponent
                  endsSetup
                  matchDoubles={matchDoubles}
                  courtSide="rightDeuce"
                  serverTeam={serverTeam}
                  serverPlayerIndex={serverPlayerIndex}
                  motionToken="setup"
                  teamAPlayers={teamAPlayers}
                  teamBPlayers={teamBPlayers}
                  courtEndsSwapped={endsSwapped}
                  courtTeamASidesMirrored={teamASidesMirrored}
                  courtTeamBSidesMirrored={teamBSidesMirrored}
                  aria-label={t('gameDetails.liveScoring.courtEndsA11y')}
                />
              )}
            </motion.div>
            <LiveCourtEndsFlipRail
              side="right"
              onFlip={() => void flipEnds()}
              className={`${flipRailClass} left-full ml-2`}
            />
          </div>
        ) : null}
        {teamSideFlip ? (
          <motion.div layout transition={courtFlipSpring}>
            <LiveCourtTeamFlipButton team={bottomTeam} onFlip={() => flipTeam(bottomTeam)} />
          </motion.div>
        ) : (
          <LiveCourtEndPlayerLabel players={playersForTeam(bottomTeam)} matchDoubles={matchDoubles} />
        )}
      </div>
    </div>
  );
}
