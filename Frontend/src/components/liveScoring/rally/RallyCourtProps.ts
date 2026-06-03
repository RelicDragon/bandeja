import type { CSSProperties } from 'react';
import type { BasicUser } from '@/types';
import type { LiveTeamSide } from '@/utils/liveScoring';
import type { CourtServeSide } from '@/utils/liveScoring/serveGuide';

export type RallyCourtProps = {
  teamAPlayers: BasicUser[];
  teamBPlayers: BasicUser[];
  teamAScore: number;
  teamBScore: number;
  matchDoubles?: boolean;
  serverTeam?: LiveTeamSide;
  serverPlayerIndex?: number;
  courtSide?: CourtServeSide;
  courtEndsSwapped?: boolean;
  courtTeamASidesMirrored?: boolean;
  courtTeamBSidesMirrored?: boolean;
  motionToken?: string;
  endsSetup?: boolean;
  className?: string;
  frameStyle?: CSSProperties;
};
