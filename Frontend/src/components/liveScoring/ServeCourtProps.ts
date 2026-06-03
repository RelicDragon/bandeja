import type { CSSProperties } from 'react';
import type { BasicUser } from '@/types';
import type { CourtServeSide, LiveTeamSide } from '@/utils/liveScoring';

export type ServeCourtProps = {
  courtSide: CourtServeSide;
  serverTeam: LiveTeamSide;
  serverPlayerIndex: number;
  motionToken: string;
  teamAPlayers: BasicUser[];
  teamBPlayers: BasicUser[];
  courtEndsSwapped?: boolean;
  courtTeamASidesMirrored?: boolean;
  courtTeamBSidesMirrored?: boolean;
  /** Bench placement preview during serve setup (no ball, arrow, or service-box highlight). */
  endsSetup?: boolean;
  /** Match format from game.playersPerMatch (4 = 2v2 court layout). */
  matchDoubles?: boolean;
  className?: string;
  frameStyle?: CSSProperties;
  'aria-label': string;
};
