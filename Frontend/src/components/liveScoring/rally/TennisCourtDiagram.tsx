import { TN_SCENE_VIEW_BOX, tnLinePaths, tnSceneGeometry } from './tennisCourtLayout';
import { RallyCourtNet } from './RallyCourtNet.tsx';

type TennisCourtDiagramProps = {
  uid: string;
  matchDoubles: boolean;
  activeServiceBox?: string;
};

export function TennisCourtDiagram({ uid, matchDoubles, activeServiceBox }: TennisCourtDiagramProps) {
  const scene = tnSceneGeometry();
  const lines = tnLinePaths(matchDoubles);

  return (
    <svg
      viewBox={TN_SCENE_VIEW_BOX}
      className="size-full overflow-visible"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <defs>
        <linearGradient id={`${uid}-surround`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e3d32" />
          <stop offset="100%" stopColor="#0f2922" />
        </linearGradient>
        <linearGradient id={`${uid}-floor`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e5a8a" />
          <stop offset="100%" stopColor="#164770" />
        </linearGradient>
        <linearGradient id={`${uid}-curb`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2d4a3e" />
          <stop offset="100%" stopColor="#1a3328" />
        </linearGradient>
        <filter id={`${uid}-floor-glow`} x="-6%" y="-4%" width="112%" height="112%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.6" floodColor="#0f172a" floodOpacity={0.18} />
        </filter>
      </defs>

      <ellipse
        cx={(scene.corners.bl.x + scene.corners.br.x) / 2}
        cy={scene.corners.bl.y + 7}
        rx={(scene.corners.br.x - scene.corners.bl.x) * 0.42}
        ry={4.5}
        fill="#0f172a"
        opacity={0.1}
      />

      <polygon points={scene.surround} fill={`url(#${uid}-surround)`} stroke="#ffffff" strokeOpacity={0.08} strokeWidth={0.7} />

      <polygon points={scene.leftCurb} fill={`url(#${uid}-curb)`} opacity={0.72} />
      <polygon points={scene.rightCurb} fill={`url(#${uid}-curb)`} opacity={0.72} />

      <polygon
        points={scene.floor}
        fill={`url(#${uid}-floor)`}
        stroke="#ffffff"
        strokeOpacity={0.22}
        strokeWidth={0.9}
        filter={`url(#${uid}-floor-glow)`}
      />

      {activeServiceBox ? (
        <polygon
          points={activeServiceBox}
          fill="rgba(251,191,36,0.26)"
          stroke="rgba(252,211,77,0.65)"
          strokeWidth={1.2}
        />
      ) : null}

      {lines.map((pts, i) => (
        <polyline
          key={i}
          points={pts}
          fill="none"
          stroke="#ffffff"
          strokeOpacity={i === 0 ? 0.92 : 0.82}
          strokeWidth={i === 0 ? 1.5 : 1.15}
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      ))}

      <RallyCourtNet net={scene.net} uid={uid} variant="tennis" />
    </svg>
  );
}
