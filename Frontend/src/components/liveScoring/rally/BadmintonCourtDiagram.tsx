import { BD_SCENE_VIEW_BOX, bdLinePaths, bdSceneGeometry } from './badmintonCourtLayout';
import { RallyCourtNet } from './RallyCourtNet.tsx';

type BadmintonCourtDiagramProps = {
  uid: string;
  activeServiceBox?: string;
};

export function BadmintonCourtDiagram({ uid, activeServiceBox }: BadmintonCourtDiagramProps) {
  const scene = bdSceneGeometry();
  const lines = bdLinePaths();

  return (
    <svg
      viewBox={BD_SCENE_VIEW_BOX}
      className="size-full overflow-visible"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <defs>
        <linearGradient id={`${uid}-surround`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#dbc498" />
          <stop offset="100%" stopColor="#b8925a" />
        </linearGradient>
        <linearGradient id={`${uid}-floor`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a664e" />
          <stop offset="100%" stopColor="#134d3c" />
        </linearGradient>
        <linearGradient id={`${uid}-curb`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#a67c52" />
          <stop offset="100%" stopColor="#8b6914" />
        </linearGradient>
        <filter id={`${uid}-floor-glow`} x="-6%" y="-4%" width="112%" height="112%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.6" floodColor="#0f172a" floodOpacity={0.16} />
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

      <polygon points={scene.surround} fill={`url(#${uid}-surround)`} stroke="#ffffff" strokeOpacity={0.1} strokeWidth={0.7} />

      <polygon points={scene.leftCurb} fill={`url(#${uid}-curb)`} opacity={0.68} />
      <polygon points={scene.rightCurb} fill={`url(#${uid}-curb)`} opacity={0.68} />

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
          fill="rgba(251,191,36,0.24)"
          stroke="rgba(252,211,77,0.62)"
          strokeWidth={1.2}
        />
      ) : null}

      {lines.map((pts, i) => (
        <polyline
          key={i}
          points={pts}
          fill="none"
          stroke="#ffffff"
          strokeOpacity={i === 0 ? 0.9 : 0.8}
          strokeWidth={i === 0 ? 1.6 : 1.2}
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      ))}

      <RallyCourtNet net={scene.net} uid={uid} variant="badminton" />
    </svg>
  );
}
