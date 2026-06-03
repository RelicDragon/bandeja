import { PADEL_COURT_BLUE, PADEL_SURROUND, PD_SCENE_VIEW_BOX, pdLinePaths, pdSceneGeometry } from './padelCourtLayout';
import { RallyCourtNet } from './RallyCourtNet.tsx';
import { PadelCourtWalls } from './PadelCourtWalls';

type PadelCourtDiagramProps = {
  uid: string;
  activeServiceBox?: string;
};

export function PadelCourtDiagram({ uid, activeServiceBox }: PadelCourtDiagramProps) {
  const scene = pdSceneGeometry();
  const lines = pdLinePaths();

  return (
    <svg viewBox={PD_SCENE_VIEW_BOX} className="size-full overflow-visible" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <defs>
        <linearGradient id={`${uid}-surround`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={PADEL_SURROUND.top} />
          <stop offset="100%" stopColor={PADEL_SURROUND.bottom} />
        </linearGradient>
        <linearGradient id={`${uid}-floor`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={PADEL_COURT_BLUE.top} />
          <stop offset="100%" stopColor={PADEL_COURT_BLUE.bottom} />
        </linearGradient>
        <filter id={`${uid}-floor-glow`} x="-6%" y="-4%" width="112%" height="112%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.8" floodColor="#0f172a" floodOpacity={0.18} />
        </filter>
      </defs>

      <ellipse
        cx={(scene.corners.bl.x + scene.corners.br.x) / 2}
        cy={scene.corners.bl.y + 8}
        rx={(scene.corners.br.x - scene.corners.bl.x) * 0.44}
        ry={5}
        fill="#0f172a"
        opacity={0.12}
      />

      <polygon points={scene.surround} fill={`url(#${uid}-surround)`} stroke="#ffffff" strokeOpacity={0.08} strokeWidth={0.8} />

      <PadelCourtWalls
        uid={uid}
        leftWall={scene.leftWall}
        rightWall={scene.rightWall}
        backWall={scene.backWall}
      />

      <polygon
        points={scene.floor}
        fill={`url(#${uid}-floor)`}
        stroke="#ffffff"
        strokeOpacity={0.28}
        strokeWidth={1}
        filter={`url(#${uid}-floor-glow)`}
      />

      {activeServiceBox ? (
        <polygon
          points={activeServiceBox}
          fill="rgba(14,165,233,0.22)"
          stroke="rgba(56,189,248,0.65)"
          strokeWidth={1.4}
        />
      ) : null}

      {lines.map((pts, i) => (
        <polyline
          key={i}
          points={pts}
          fill="none"
          stroke="#ffffff"
          strokeOpacity={i === 0 ? 0.92 : 0.82}
          strokeWidth={i === 0 ? 1.8 : 1.35}
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      ))}

      <RallyCourtNet net={scene.net} uid={uid} variant="padel" />
    </svg>
  );
}
