import type { ComponentType, Dispatch, SetStateAction } from 'react';
import { motion, useAnimation, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { BasicUser } from '@/types';
import type { LiveMatchCourtOrientation, LiveTeamSide } from '@/utils/liveScoring';
import { LiveCourtEndsFlipRail } from './LiveCourtEndsFlipRail';
import { LiveCourtTeamFlipButton } from './LiveCourtTeamFlipButton';
import { courtFlipMid, courtFlipSpring } from './liveCourtFlipMotion';
import { ServeCourtSchema, type ServeCourtSchemaProps } from './ServeCourtSchema';

type LiveCourtEndsSetupProps = {
  teamAPlayers: BasicUser[];
  teamBPlayers: BasicUser[];
  CourtSchemaComponent?: ComponentType<ServeCourtSchemaProps>;
  matchDoubles?: boolean;
  orientation: LiveMatchCourtOrientation;
  onOrientationChange: Dispatch<SetStateAction<LiveMatchCourtOrientation>>;
};

function teamAtEnd(endsSwapped: boolean, end: 'top' | 'bottom'): LiveTeamSide {
  if (end === 'top') return endsSwapped ? 'teamA' : 'teamB';
  return endsSwapped ? 'teamB' : 'teamA';
}

export function LiveCourtEndsSetup({
  teamAPlayers,
  teamBPlayers,
  CourtSchemaComponent = ServeCourtSchema,
  matchDoubles = false,
  orientation,
  onOrientationChange,
}: LiveCourtEndsSetupProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const courtAnim = useAnimation();
  const { endsSwapped, teamASidesMirrored, teamBSidesMirrored } = orientation;
  const topTeam = teamAtEnd(endsSwapped, 'top');
  const bottomTeam = teamAtEnd(endsSwapped, 'bottom');

  const flipTeamSides = (team: LiveTeamSide) => {
    if (team === 'teamA') {
      onOrientationChange((prev) => ({ ...prev, teamASidesMirrored: !prev.teamASidesMirrored }));
    } else {
      onOrientationChange((prev) => ({ ...prev, teamBSidesMirrored: !prev.teamBSidesMirrored }));
    }
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

  return (
    <div className="relative mt-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {t('gameDetails.liveScoring.courtEndsTitle')}
      </div>
      <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">{t('gameDetails.liveScoring.courtEndsSubtitle')}</p>

      <div className="mt-3 flex items-stretch justify-center gap-2">
        <LiveCourtEndsFlipRail side="left" onFlip={() => void flipEnds()} />
        <div className="flex min-w-0 flex-col items-center gap-2">
          <LiveCourtTeamFlipButton team={topTeam} onFlip={() => flipTeam(topTeam)} />
          <div className="[perspective:640px]">
            <motion.div animate={courtAnim} className="origin-center [transform-style:preserve-3d]">
              <CourtSchemaComponent
                endsSetup
                matchDoubles={matchDoubles}
                courtSide="rightDeuce"
                serverTeam="teamA"
                serverPlayerIndex={0}
                motionToken="setup"
                teamAPlayers={teamAPlayers}
                teamBPlayers={teamBPlayers}
                courtEndsSwapped={endsSwapped}
                courtTeamASidesMirrored={teamASidesMirrored}
                courtTeamBSidesMirrored={teamBSidesMirrored}
                className="h-[11rem] w-[5.5rem] shrink-0 overflow-hidden"
                aria-label={t('gameDetails.liveScoring.courtEndsA11y')}
              />
            </motion.div>
          </div>
          <motion.div layout transition={courtFlipSpring}>
            <LiveCourtTeamFlipButton team={bottomTeam} onFlip={() => flipTeam(bottomTeam)} />
          </motion.div>
        </div>
        <LiveCourtEndsFlipRail side="right" onFlip={() => void flipEnds()} />
      </div>
    </div>
  );
}
