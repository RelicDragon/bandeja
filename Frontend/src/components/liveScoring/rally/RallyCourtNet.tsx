import {
  RALLY_COURT_NET_PRESETS,
  type RallyCourtNetLayout,
  type RallyCourtNetPostStyle,
  type RallyCourtNetVariant,
  rallyCourtNetDims,
  rallyCourtNetPatternSize,
} from './rallyCourtNetConfig';

type RallyCourtNetProps = {
  net: RallyCourtNetLayout;
  uid: string;
  variant: RallyCourtNetVariant;
};

function postGradStops(style: RallyCourtNetPostStyle): { stops: { offset: string; color: string }[]; stroke: string; highlight: string } {
  switch (style) {
    case 'dark':
      return {
        stops: [
          { offset: '0%', color: '#1e3a5f' },
          { offset: '40%', color: '#64748b' },
          { offset: '100%', color: '#334155' },
        ],
        stroke: '#1e293b',
        highlight: '#94a3b8',
      };
    case 'wood':
      return {
        stops: [
          { offset: '0%', color: '#92400e' },
          { offset: '35%', color: '#facc15' },
          { offset: '100%', color: '#a16207' },
        ],
        stroke: '#78350f',
        highlight: '#fef08a',
      };
    default:
      return {
        stops: [
          { offset: '0%', color: '#e2e8f0' },
          { offset: '35%', color: '#ffffff' },
          { offset: '100%', color: '#cbd5e1' },
        ],
        stroke: '#94a3b8',
        highlight: '#ffffff',
      };
  }
}

export function RallyCourtNet({ net, uid, variant }: RallyCourtNetProps) {
  const { left, right, floorY, span, centerX } = net;
  const preset = RALLY_COURT_NET_PRESETS[variant];
  const { meshH, postH, tapeH, postW, meshBottomOffset } = rallyCourtNetDims(variant, net);
  const inset = postW * 0.12;
  const postStyle = postGradStops(preset.postStyle);

  const meshClip = `${uid}-rally-net-clip`;
  const tapeGrad = `${uid}-rally-net-tape`;
  const meshPattern = `${uid}-rally-net-mesh-pat`;
  const postGrad = `${uid}-rally-net-post`;

  const meshX = left.x + postW - inset;
  const meshW = span - (postW - inset) * 2;
  const meshBottom = floorY - meshBottomOffset;
  const meshTop = meshBottom - meshH;
  const tapeTop = preset.tapeAtPostTop ? floorY - postH : meshTop - tapeH;

  const patternSize = rallyCourtNetPatternSize(meshH, preset);
  const ps = patternSize.toFixed(2);

  return (
    <g aria-hidden>
      <defs>
        <clipPath id={meshClip}>
          <rect x={meshX} y={meshTop - 0.2} width={meshW} height={meshH + 0.4} rx={0.35} />
        </clipPath>
        <linearGradient id={tapeGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e2e8f0" stopOpacity={0.9} />
        </linearGradient>
        <linearGradient id={postGrad} x1="0" y1="0" x2="1" y2="0">
          {postStyle.stops.map((s) => (
            <stop key={s.offset} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>
        <pattern id={meshPattern} width={patternSize} height={patternSize} patternUnits="userSpaceOnUse">
          <path
            d={`M0 0 H${ps} M0 0 V${ps} M0 ${ps} L${ps} 0 M0 0 L${ps} ${ps}`}
            fill="none"
            stroke="#94a3b8"
            strokeWidth={0.32}
            strokeOpacity={0.52}
          />
        </pattern>
      </defs>

      <ellipse
        cx={centerX}
        cy={floorY + preset.shadowOffsetY}
        rx={span * 0.38}
        ry={preset.shadowRy}
        fill="#020617"
        opacity={0.14}
      />

      {[left.x, right.x - postW].map((px) => (
        <g key={`post-${px}`}>
          <rect
            x={px}
            y={floorY - postH}
            width={postW}
            height={postH}
            rx={0.7}
            fill={`url(#${postGrad})`}
            stroke={postStyle.stroke}
            strokeWidth={0.4}
          />
          {preset.postStyle !== 'dark' ? (
            <line
              x1={px + postW * 0.32}
              y1={floorY - postH + 0.8}
              x2={px + postW * 0.32}
              y2={floorY - 0.8}
              stroke={postStyle.highlight}
              strokeWidth={0.55}
              opacity={preset.postStyle === 'wood' ? 0.75 : 0.7}
            />
          ) : null}
        </g>
      ))}

      <g clipPath={`url(#${meshClip})`}>
        <rect x={meshX} y={meshTop} width={meshW} height={meshH} fill={`url(#${meshPattern})`} />
        <rect
          x={meshX}
          y={meshTop}
          width={meshW}
          height={meshH}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={0.28}
          strokeOpacity={0.45}
        />
      </g>

      <rect
        x={left.x + postW * 0.35}
        y={tapeTop + 0.2}
        width={span - postW * 0.7}
        height={tapeH}
        rx={0.35}
        fill="#64748b"
        opacity={0.2}
      />
      <rect
        x={left.x + postW * 0.35}
        y={tapeTop}
        width={span - postW * 0.7}
        height={tapeH}
        rx={0.35}
        fill={`url(#${tapeGrad})`}
        stroke="#cbd5e1"
        strokeWidth={0.25}
        strokeOpacity={0.6}
      />
      <line
        x1={left.x + postW * 0.5}
        y1={tapeTop + tapeH * 0.35}
        x2={right.x - postW * 0.5}
        y2={tapeTop + tapeH * 0.35}
        stroke="#ffffff"
        strokeWidth={0.7}
        opacity={0.88}
      />

      {meshBottomOffset === 0 ? (
        <>
          <line
            x1={meshX}
            y1={floorY}
            x2={meshX + meshW}
            y2={floorY}
            stroke="#f8fafc"
            strokeWidth={0.55}
            opacity={0.75}
          />
          <line
            x1={left.x + postW * 0.45}
            y1={floorY}
            x2={right.x - postW * 0.45}
            y2={floorY}
            stroke="#0f172a"
            opacity={0.1}
            strokeWidth={0.75}
          />
        </>
      ) : null}
    </g>
  );
}
