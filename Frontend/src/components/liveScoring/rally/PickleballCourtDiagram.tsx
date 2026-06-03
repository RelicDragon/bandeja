import { PB_COURT_BLUE, PB_SURROUND_GREEN } from './pickleballCourtGeometry';
import { PB_SCENE_VIEW_BOX, pbLinePaths, pbSceneGeometry } from './pickleballCourtLayout';
import { RallyCourtNet } from './RallyCourtNet.tsx';

type PickleballCourtDiagramProps = {
  uid: string;
  activeServiceBox?: string;
};

export function PickleballCourtDiagram({ uid, activeServiceBox }: PickleballCourtDiagramProps) {
  const scene = pbSceneGeometry();
  const lines = pbLinePaths();

  return (
    <svg viewBox={PB_SCENE_VIEW_BOX} className="size-full overflow-visible" preserveAspectRatio="xMidYMid meet" aria-hidden>
      <defs>
        <linearGradient id={`${uid}-surround`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={PB_SURROUND_GREEN.top} />
          <stop offset="100%" stopColor={PB_SURROUND_GREEN.bottom} />
        </linearGradient>
        <linearGradient id={`${uid}-floor`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={PB_COURT_BLUE.top} />
          <stop offset="100%" stopColor={PB_COURT_BLUE.bottom} />
        </linearGradient>
        <linearGradient id={`${uid}-curb`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2a5c32" />
          <stop offset="100%" stopColor="#1e4624" />
        </linearGradient>
        <filter id={`${uid}-floor-glow`} x="-6%" y="-4%" width="112%" height="112%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.8" floodColor="#0f172a" floodOpacity={0.14} />
        </filter>
      </defs>

      <ellipse
        cx={(scene.corners.bl.x + scene.corners.br.x) / 2}
        cy={scene.corners.bl.y + 8}
        rx={(scene.corners.br.x - scene.corners.bl.x) * 0.44}
        ry={5}
        fill="#0f172a"
        opacity={0.1}
      />

      <polygon points={scene.surround} fill={`url(#${uid}-surround)`} stroke="#ffffff" strokeOpacity={0.12} strokeWidth={0.8} />

      <polygon points={scene.leftCurb} fill={`url(#${uid}-curb)`} opacity={0.72} />
      <polygon points={scene.rightCurb} fill={`url(#${uid}-curb)`} opacity={0.72} />

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
          fill="rgba(253,224,71,0.22)"
          stroke="rgba(253,224,71,0.55)"
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

      <RallyCourtNet net={scene.net} uid={uid} variant="pickleball" />
    </svg>
  );
}
