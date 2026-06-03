import type { SqFrontWallScene, SqWallSegment } from './squashFrontWallGeometry';

type SquashFrontWallProps = {
  wall: SqFrontWallScene;
  uid: string;
};

const WALL_MARK_STROKE = '#c1121f';
const WALL_STRUCT_STROKE = '#94a3b8';

function WallMarkLine({ line }: { line: SqWallSegment }) {
  return (
    <line
      x1={line.x1}
      y1={line.y1}
      x2={line.x2}
      y2={line.y2}
      stroke={WALL_MARK_STROKE}
      strokeWidth={0.9}
      strokeLinecap="round"
      opacity={0.88}
    />
  );
}

export function SquashFrontWall({ wall, uid }: SquashFrontWallProps) {
  const { outLine, serviceLine, tinTopLine } = wall;

  return (
    <>
      <defs>
        <linearGradient id={`${uid}-fw-face`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#ececec" />
        </linearGradient>
      </defs>

      <polygon points={wall.face} fill={`url(#${uid}-fw-face)`} stroke="none" />
      <polygon
        points={wall.wallOutline}
        fill="none"
        stroke={WALL_STRUCT_STROKE}
        strokeWidth={0.55}
        strokeLinejoin="round"
      />

      <WallMarkLine line={tinTopLine} />
      <WallMarkLine line={serviceLine} />
      <WallMarkLine line={outLine} />
    </>
  );
}
