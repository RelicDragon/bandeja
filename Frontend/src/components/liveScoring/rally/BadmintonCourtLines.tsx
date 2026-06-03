import {
  BD_CENTER_X,
  BD_CENTRE_LINE_BOTTOM_START,
  BD_CENTRE_LINE_TOP_END,
  BD_COURT_H,
  BD_COURT_W,
  BD_DOUBLES_LONG_BOTTOM,
  BD_DOUBLES_LONG_TOP,
  BD_SHORT_SERVICE_BOTTOM,
  BD_SHORT_SERVICE_TOP,
  BD_SINGLES_LEFT,
  BD_SINGLES_RIGHT,
} from './badmintonCourtGeometry';

/** BWF full court — every horizontal line spans the doubles width (6.10 m). */
export function BadmintonCourtLines() {
  const LINE = '#ffffff';
  const w = BD_COURT_W;
  const h = BD_COURT_H;
  const sw = 1.35;
  const half = sw / 2;

  const hLine = (y: number, key: string) => (
    <line
      key={key}
      x1={half}
      y1={y}
      x2={w - half}
      y2={y}
      stroke={LINE}
      strokeWidth={sw}
      vectorEffect="non-scaling-stroke"
    />
  );

  const vLine = (x: number, y1: number, y2: number, key: string) => (
    <line
      key={key}
      x1={x}
      y1={y1}
      x2={x}
      y2={y2}
      stroke={LINE}
      strokeWidth={sw}
      vectorEffect="non-scaling-stroke"
    />
  );

  return (
    <g aria-hidden pointerEvents="none" fill="none" stroke={LINE} shapeRendering="crispEdges">
      {/* Doubles boundary — back/side lines meet at all four corners */}
      <rect
        x={half}
        y={half}
        width={w - sw}
        height={h - sw}
        stroke={LINE}
        strokeWidth={sw}
        vectorEffect="non-scaling-stroke"
      />

      {hLine(BD_SHORT_SERVICE_TOP, 'short-top')}
      {hLine(BD_SHORT_SERVICE_BOTTOM, 'short-bottom')}
      {hLine(BD_DOUBLES_LONG_TOP, 'dbl-long-top')}
      {hLine(BD_DOUBLES_LONG_BOTTOM, 'dbl-long-bottom')}

      {vLine(BD_SINGLES_LEFT, half, h - half, 'singles-l')}
      {vLine(BD_SINGLES_RIGHT, half, h - half, 'singles-r')}

      {/* Centre line: short service → back boundary only (never through front service courts). */}
      {vLine(BD_CENTER_X, half, BD_CENTRE_LINE_TOP_END, 'centre-top')}
      {vLine(BD_CENTER_X, BD_CENTRE_LINE_BOTTOM_START, h - half, 'centre-bottom')}
    </g>
  );
}
