import type { PdBackWallScene } from './padelCourtLayout';

type PadelCourtWallsProps = {
  uid: string;
  leftWall: string;
  rightWall: string;
  backWall: PdBackWallScene;
};

function SideWall({
  points,
  uid,
  side,
}: {
  points: string;
  uid: string;
  side: 'left' | 'right';
}) {
  const grad = side === 'left' ? `${uid}-side-l` : `${uid}-side-r`;
  return (
    <polygon
      points={points}
      fill={`url(#${grad})`}
      stroke="rgba(255,255,255,0.32)"
      strokeWidth={0.45}
      strokeLinejoin="round"
    />
  );
}

export function PadelCourtWalls({ uid, leftWall, rightWall, backWall }: PadelCourtWallsProps) {
  return (
    <g aria-hidden>
      <defs>
        <linearGradient id={`${uid}-side-l`} x1="1" y1="0" x2="0" y2="0.85">
          <stop offset="0%" stopColor="rgba(248,250,252,0.7)" />
          <stop offset="50%" stopColor="rgba(224,242,254,0.45)" />
          <stop offset="100%" stopColor="rgba(148,163,184,0.18)" />
        </linearGradient>
        <linearGradient id={`${uid}-side-r`} x1="0" y1="0" x2="1" y2="0.85">
          <stop offset="0%" stopColor="rgba(248,250,252,0.7)" />
          <stop offset="50%" stopColor="rgba(224,242,254,0.45)" />
          <stop offset="100%" stopColor="rgba(148,163,184,0.18)" />
        </linearGradient>
        <linearGradient id={`${uid}-back-glass`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="rgba(241,245,249,0.95)" />
          <stop offset="100%" stopColor="rgba(226,232,240,0.82)" />
        </linearGradient>
        <linearGradient id={`${uid}-back-mesh`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="rgba(203,213,225,0.5)" />
          <stop offset="100%" stopColor="rgba(148,163,184,0.35)" />
        </linearGradient>
      </defs>

      <SideWall points={leftWall} uid={uid} side="left" />
      <SideWall points={rightWall} uid={uid} side="right" />

      <polygon points={backWall.glass} fill={`url(#${uid}-back-glass)`} stroke="none" />
      <polygon points={backWall.mesh} fill={`url(#${uid}-back-mesh)`} stroke="none" />

      {backWall.mullions.map((m, i) => (
        <line
          key={`mullion-${i}`}
          x1={m.x1}
          y1={m.y1}
          x2={m.x2}
          y2={m.y2}
          stroke="rgba(255,255,255,0.45)"
          strokeWidth={0.55}
          strokeLinecap="round"
        />
      ))}

      <line
        x1={backWall.crestLine.x1}
        y1={backWall.crestLine.y1}
        x2={backWall.crestLine.x2}
        y2={backWall.crestLine.y2}
        stroke="rgba(255,255,255,0.55)"
        strokeWidth={0.7}
        strokeLinecap="round"
      />
    </g>
  );
}
