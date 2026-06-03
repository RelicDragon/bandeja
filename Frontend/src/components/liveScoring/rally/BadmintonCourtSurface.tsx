import { BD_COURT_H, BD_COURT_W } from './badmintonCourtGeometry';

/** Green playing surface fill. */
export function BadmintonCourtSurface() {
  return (
    <g aria-hidden>
      <defs>
        <linearGradient id="bdCourtGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a664e" />
          <stop offset="100%" stopColor="#134d3c" />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={BD_COURT_W} height={BD_COURT_H} fill="url(#bdCourtGrad)" />
    </g>
  );
}
