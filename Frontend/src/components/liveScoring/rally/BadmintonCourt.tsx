import { PlayerAvatar } from '@/components';
import type { BasicUser } from '@/types';
import type { LiveTeamSide } from '@/utils/liveScoring';
import type { CourtServeSide } from '@/utils/liveScoring/serveGuide';
import type { RallyCourtProps } from './RallyCourtProps';
import { RallyCourtFrame } from './RallyCourtFrame';

type BadmintonCourtProps = RallyCourtProps & {
  serverTeam?: LiveTeamSide;
  serverPlayerIndex?: number;
  courtSide?: CourtServeSide;
  'aria-label'?: string;
};

function playerLabel(p: BasicUser): string {
  return [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.id;
}

export function BadmintonCourt({
  teamAPlayers,
  teamBPlayers,
  serverTeam,
  serverPlayerIndex = 0,
  courtSide,
  className,
  'aria-label': ariaLabel,
}: BadmintonCourtProps) {
  void ariaLabel;
  const a0 = teamAPlayers[0];
  const b0 = teamBPlayers[0];
  const servingTop = serverTeam === 'teamA';
  const serveRight = courtSide === 'rightDeuce';
  const highlightLeft = !serveRight;
  const highlightRight = serveRight;

  const serviceBox = (x: number, y: number, w: number, h: number, active: boolean) => (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      className={
        active
          ? 'fill-amber-400/30 stroke-amber-500/70 dark:fill-amber-400/20 dark:stroke-amber-300/60'
          : 'fill-transparent stroke-sky-900/15 dark:stroke-sky-200/15'
      }
      strokeWidth={active ? 2 : 1}
      rx={2}
    />
  );

  const playerMark = (p: BasicUser, team: LiveTeamSide, y: number) => {
    const serving = serverTeam === team && serverPlayerIndex === 0;
    return (
      <g key={p.id} transform={`translate(48, ${y - 12})`}>
        <circle
          cx={12}
          cy={12}
          r={serving ? 14 : 11}
          className={serving ? 'fill-amber-400/35 stroke-amber-300' : 'fill-transparent stroke-transparent'}
          strokeWidth={2}
        />
        <foreignObject width={24} height={24} x={0} y={0}>
          <div className="flex h-6 w-6 items-center justify-center">
            <PlayerAvatar player={p} showName={false} inlineFace inlineFacePlain asDiv subscribePresence={false} />
          </div>
        </foreignObject>
        <title>{playerLabel(p)}</title>
      </g>
    );
  };

  return (
    <RallyCourtFrame viewBox="0 0 120 220" surfaceClassName="rounded-md" className={className}>
      <rect
        x="4"
        y="4"
        width="112"
        height="212"
        className="fill-sky-100/90 stroke-sky-900/30 dark:fill-sky-950/50"
        strokeWidth="2"
      />
      <line x1="4" y1="110" x2="116" y2="110" className="stroke-sky-900/50 dark:stroke-sky-200/50" strokeWidth="2" />
      <line x1="60" y1="4" x2="60" y2="216" className="stroke-sky-900/35 dark:stroke-sky-200/35" strokeWidth="1.5" />
      {serviceBox(4, 4, 56, 106, servingTop && highlightLeft)}
      {serviceBox(60, 4, 56, 106, servingTop && highlightRight)}
      {serviceBox(4, 110, 56, 106, !servingTop && highlightLeft)}
      {serviceBox(60, 110, 56, 106, !servingTop && highlightRight)}
      {a0 ? playerMark(a0, 'teamA', 52) : null}
      {b0 ? playerMark(b0, 'teamB', 168) : null}
    </RallyCourtFrame>
  );
}
