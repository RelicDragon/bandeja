import type { LiveMatchCourtOrientation, LivePointsServeRotation, LiveTeamSide } from '@/utils/liveScoring';
import { squashSetupCourtEndsSwappedForFirstServer } from '@/utils/liveScoring/squashServe';

function coin(): boolean {
  return Math.random() < 0.5;
}

export function randomizeServeSetupState(opts: {
  matchDoubles: boolean;
  showServeRotationRules: boolean;
  squashSidesSetup: boolean;
}): {
  side: LiveTeamSide;
  doublesIdx: number;
  rotation: LivePointsServeRotation;
  courtOrientation: LiveMatchCourtOrientation;
} {
  const side: LiveTeamSide = coin() ? 'teamA' : 'teamB';
  const doublesIdx = opts.matchDoubles && coin() ? 1 : 0;
  const rotation: LivePointsServeRotation =
    opts.showServeRotationRules && coin() ? 'simple' : 'official';

  const courtOrientation: LiveMatchCourtOrientation = opts.squashSidesSetup
    ? {
        endsSwapped: squashSetupCourtEndsSwappedForFirstServer(side),
        teamASidesMirrored: false,
        teamBSidesMirrored: false,
      }
    : {
        endsSwapped: coin(),
        teamASidesMirrored: opts.matchDoubles ? coin() : false,
        teamBSidesMirrored: opts.matchDoubles ? coin() : false,
      };

  return { side, doublesIdx, rotation, courtOrientation };
}
