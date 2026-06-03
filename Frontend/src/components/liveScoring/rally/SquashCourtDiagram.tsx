import { SQ_COURT_FLOOR, SQ_SURROUND } from './squashCourtGeometry';
import { SQ_SCENE_VIEW_BOX, sqLinePaths, sqSceneGeometry } from './squashCourtLayout';
import { sqFrontWallScene } from './squashFrontWallGeometry';
import { SquashFrontWall } from './SquashFrontWall';

type SquashCourtDiagramProps = {
  activeServiceBox?: string;
  uid: string;
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
      stroke="#94a3b8"
      strokeWidth={0.5}
      strokeLinejoin="round"
    />
  );
}

export function SquashCourtDiagram({ activeServiceBox, uid }: SquashCourtDiagramProps) {
  const scene = sqSceneGeometry();
  const frontWall = sqFrontWallScene();
  const lines = sqLinePaths();

  return (
    <svg viewBox={SQ_SCENE_VIEW_BOX} className="size-full overflow-visible" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <defs>
        <linearGradient id={`${uid}-surround`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={SQ_SURROUND.top} />
          <stop offset="100%" stopColor={SQ_SURROUND.bottom} />
        </linearGradient>
        <linearGradient id={`${uid}-floor`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={SQ_COURT_FLOOR.top} />
          <stop offset="100%" stopColor={SQ_COURT_FLOOR.bottom} />
        </linearGradient>
        <linearGradient id={`${uid}-side-l`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="55%" stopColor="#e2e8f0" />
          <stop offset="100%" stopColor="#94a3b8" />
        </linearGradient>
        <linearGradient id={`${uid}-side-r`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="55%" stopColor="#e2e8f0" />
          <stop offset="100%" stopColor="#94a3b8" />
        </linearGradient>
        <filter id={`${uid}-glow`} x="-6%" y="-4%" width="112%" height="112%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.6" floodColor="#0f172a" floodOpacity={0.14} />
        </filter>
      </defs>

      <polygon points={scene.surround} fill={`url(#${uid}-surround)`} stroke="#ffffff" strokeOpacity={0.1} strokeWidth={0.7} />

      <SideWall points={scene.leftWall} uid={uid} side="left" />
      <SideWall points={scene.rightWall} uid={uid} side="right" />

      <SquashFrontWall wall={frontWall} uid={uid} />

      <polygon
        points={scene.floor}
        fill={`url(#${uid}-floor)`}
        stroke="#475569"
        strokeOpacity={0.35}
        strokeWidth={0.9}
        filter={`url(#${uid}-glow)`}
      />

      {activeServiceBox ? (
        <polygon
          points={activeServiceBox}
          fill="rgba(251,191,36,0.32)"
          stroke="#d97706"
          strokeWidth={1.4}
        />
      ) : null}

      {lines.map((pts, i) => (
        <polyline
          key={i}
          points={pts}
          fill="none"
          stroke="#334155"
          strokeOpacity={0.85}
          strokeWidth={1.15}
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      ))}
    </svg>
  );
}
