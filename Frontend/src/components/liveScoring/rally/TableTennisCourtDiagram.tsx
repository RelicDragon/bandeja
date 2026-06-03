import { TT_SCENE_VIEW_BOX, ttLinePaths, ttSceneGeometry } from './tableTennisCourtLayout';
import { RallyCourtNet } from './RallyCourtNet.tsx';

type TableTennisCourtDiagramProps = {
  uid: string;
  matchDoubles: boolean;
  activeServiceQuadrant?: string;
};

export function TableTennisCourtDiagram({
  uid,
  matchDoubles,
  activeServiceQuadrant,
}: TableTennisCourtDiagramProps) {
  const scene = ttSceneGeometry();
  const lines = ttLinePaths(matchDoubles);

  return (
    <svg
      viewBox={TT_SCENE_VIEW_BOX}
      className="size-full overflow-visible"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <defs>
        <linearGradient id={`${uid}-frame`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#475569" />
          <stop offset="100%" stopColor="#1e293b" />
        </linearGradient>
        <linearGradient id={`${uid}-floor`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a8572" />
          <stop offset="100%" stopColor="#167a68" />
        </linearGradient>
        <linearGradient id={`${uid}-apron`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#64748b" />
          <stop offset="100%" stopColor="#334155" />
        </linearGradient>
        <filter id={`${uid}-floor-glow`} x="-8%" y="-6%" width="116%" height="116%">
          <feDropShadow dx="0" dy="1.2" stdDeviation="1.4" floodColor="#0f172a" floodOpacity={0.2} />
        </filter>
      </defs>

      <ellipse
        cx={scene.shadow.cx}
        cy={scene.shadow.cy}
        rx={scene.shadow.rx}
        ry={scene.shadow.ry}
        fill="#0f172a"
        opacity={0.14}
      />

      {scene.legs.map((leg) => (
        <rect
          key={`leg-${leg.x}`}
          x={leg.x}
          y={leg.y}
          width={leg.w}
          height={leg.h}
          rx={1.5}
          className="fill-slate-700/85"
        />
      ))}

      <polygon points={scene.frame} fill={`url(#${uid}-frame)`} stroke="#0f172a" strokeOpacity={0.35} strokeWidth={0.8} />

      <polygon points={scene.leftApron} fill={`url(#${uid}-apron)`} opacity={0.72} />
      <polygon points={scene.rightApron} fill={`url(#${uid}-apron)`} opacity={0.72} />

      <polygon
        points={scene.floor}
        fill={`url(#${uid}-floor)`}
        stroke="#ffffff"
        strokeOpacity={0.2}
        strokeWidth={0.85}
        filter={`url(#${uid}-floor-glow)`}
      />

      {activeServiceQuadrant ? (
        <polygon
          points={activeServiceQuadrant}
          fill="rgba(251,191,36,0.22)"
          stroke="rgba(252,211,77,0.58)"
          strokeWidth={1.1}
        />
      ) : null}

      {lines.map((pts, i) => (
        <polyline
          key={i}
          points={pts}
          fill="none"
          stroke="#ffffff"
          strokeOpacity={i === 0 ? 0.92 : 0.78}
          strokeWidth={i === 0 ? 2 : 1.25}
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      ))}

      <RallyCourtNet net={scene.net} uid={uid} variant="tableTennis" />
    </svg>
  );
}
