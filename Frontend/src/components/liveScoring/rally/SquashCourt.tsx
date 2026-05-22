import type { BasicUser } from '@/types';
import { PlayerAvatar } from '@/components';
import type { RallyCourtProps } from './RallyCourtProps';
import { RallyCourtFrame } from './RallyCourtFrame';

function playerLabel(p: BasicUser): string {
  return [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.id;
}

export function SquashCourt({ teamAPlayers, teamBPlayers, className }: RallyCourtProps) {
  const top = teamBPlayers[0];
  const bottom = teamAPlayers[0];

  return (
    <RallyCourtFrame viewBox="0 0 100 200" surfaceClassName="rounded-sm" className={className}>
      <rect x="4" y="4" width="92" height="192" className="fill-red-800/85 stroke-red-950/40" strokeWidth="2" />
      <line x1="4" y1="100" x2="96" y2="100" className="stroke-white/55" strokeWidth="2" />
      <line x1="50" y1="4" x2="50" y2="196" className="stroke-white/30" strokeWidth="1" strokeDasharray="3 3" />
      {[
        { x: 50, y: 28, p: top },
        { x: 50, y: 172, p: bottom },
      ].map(({ x, y, p }, i) =>
        p ? (
          <g key={p.id ?? i} transform={`translate(${x - 12}, ${y - 12})`}>
            <foreignObject width={24} height={24}>
              <div className="flex h-6 w-6 items-center justify-center">
                <PlayerAvatar player={p} showName={false} inlineFace inlineFacePlain asDiv subscribePresence={false} />
              </div>
            </foreignObject>
            <title>{playerLabel(p)}</title>
          </g>
        ) : null
      )}
    </RallyCourtFrame>
  );
}
