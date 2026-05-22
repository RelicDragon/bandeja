import { PlayerAvatar } from '@/components';
import type { BasicUser } from '@/types';
import type { LiveTeamSide } from '@/utils/liveScoring';
import type { RallyCourtProps } from './RallyCourtProps';
import { RallyCourtFrame } from './RallyCourtFrame';

type TableTennisCourtProps = RallyCourtProps & {
  serverTeam?: LiveTeamSide;
  serverPlayerIndex?: number;
  'aria-label'?: string;
};

function playerLabel(p: BasicUser): string {
  return [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.id;
}

export function TableTennisCourt({
  teamAPlayers,
  teamBPlayers,
  serverTeam,
  serverPlayerIndex = 0,
  className,
  'aria-label': ariaLabel,
}: TableTennisCourtProps) {
  void ariaLabel;
  const a0 = teamAPlayers[0];
  const a1 = teamAPlayers[1] ?? teamAPlayers[0];
  const b0 = teamBPlayers[0];
  const b1 = teamBPlayers[1] ?? teamBPlayers[0];

  const slots: { x: number; y: number; p?: BasicUser; team: LiveTeamSide; idx: number }[] = [
    { x: 52, y: 38, p: a0, team: 'teamA', idx: 0 },
    { x: 222, y: 38, p: a1, team: 'teamA', idx: 1 },
    { x: 52, y: 114, p: b0, team: 'teamB', idx: 0 },
    { x: 222, y: 114, p: b1, team: 'teamB', idx: 1 },
  ];

  return (
    <RallyCourtFrame viewBox="0 0 274 152" surfaceClassName="rounded-lg" className={className}>
      <rect x="2" y="2" width="270" height="148" rx="4" className="fill-emerald-700/90 stroke-emerald-950/40" strokeWidth="2" />
      <line x1="137" y1="2" x2="137" y2="150" className="stroke-white/70" strokeWidth="2" />
      <rect x="2" y="62" width="270" height="28" className="fill-none stroke-white/35" strokeWidth="1.5" />
      {slots.map(({ x, y, p, team, idx }) => {
        if (!p) return null;
        const serving = serverTeam === team && serverPlayerIndex === idx;
        return (
          <g key={`${p.id}-${idx}`} transform={`translate(${x - 12}, ${y - 12})`}>
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
      })}
    </RallyCourtFrame>
  );
}
