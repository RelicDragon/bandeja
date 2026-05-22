import type { LiveTeamSide } from '@/utils/liveScoring';
import type { CourtServeSide } from '@/utils/liveScoring/serveGuide';
import type { RallyCourtProps } from './RallyCourtProps';
import { RallyCourtFrame } from './RallyCourtFrame';
import {
  PICKLEBALL_COURT_VIEW_BOX,
  PICKLEBALL_NET_Y,
  pickleballNvzLineY,
} from './pickleballCourtGeometry';

type PickleballCourtProps = RallyCourtProps & {
  serverTeam?: LiveTeamSide;
  courtSide?: CourtServeSide;
  'aria-label'?: string;
};

function serveHighlightRect(serverTeam: LiveTeamSide, courtSide: CourtServeSide) {
  const topHalf = serverTeam === 'teamB';
  const rightHalf = courtSide === 'rightDeuce';
  const x = rightHalf ? 50 : 2;
  const y = topHalf ? 2 : PICKLEBALL_NET_Y;
  const w = 48;
  const h = topHalf ? PICKLEBALL_NET_Y - 2 : 98;
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      className="fill-amber-400/25 stroke-amber-300/70 dark:fill-amber-400/15 dark:stroke-amber-300/50"
      strokeWidth={2}
      rx={2}
    />
  );
}

export function PickleballCourt({ className, serverTeam, courtSide }: PickleballCourtProps) {
  const nvzTopY = pickleballNvzLineY('top');
  const nvzBottomY = pickleballNvzLineY('bottom');
  const showServe = serverTeam != null && courtSide != null;

  return (
    <RallyCourtFrame viewBox={PICKLEBALL_COURT_VIEW_BOX} surfaceClassName="rounded-md" className={className}>
      <rect x="2" y="2" width="96" height="196" className="fill-amber-600/75 stroke-amber-950/35" strokeWidth="2" />
      {showServe ? serveHighlightRect(serverTeam, courtSide) : null}
      <line x1="2" y1={PICKLEBALL_NET_Y} x2="98" y2={PICKLEBALL_NET_Y} className="stroke-white/75" strokeWidth="2.5" />
      <line
        x1="2"
        y1={nvzTopY}
        x2="98"
        y2={nvzTopY}
        className="stroke-amber-100/70"
        strokeWidth="1.5"
        strokeDasharray="4 3"
      />
      <line
        x1="2"
        y1={nvzBottomY}
        x2="98"
        y2={nvzBottomY}
        className="stroke-amber-100/70"
        strokeWidth="1.5"
        strokeDasharray="4 3"
      />
      <line x1="50" y1="2" x2="50" y2={nvzTopY} className="stroke-white/40" strokeWidth="1" />
      <line x1="50" y1={nvzBottomY} x2="50" y2="198" className="stroke-white/40" strokeWidth="1" />
    </RallyCourtFrame>
  );
}
