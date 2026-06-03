type BadmintonCourtNetProps = {
  x: number;
  y: number;
  width: number;
  id: string;
};

/** Visible plan-view net with tape, mesh, posts, and ground shadow. */
export function BadmintonCourtNet({ x, y, width, id }: BadmintonCourtNetProps) {
  const tapeH = 2;
  const meshH = 5.5;
  const postW = 2.8;
  const postH = meshH + tapeH + 3;
  const tapeY = y - meshH / 2 - tapeH;
  const meshY = y - meshH / 2;
  const cx = x + width / 2;

  const tapeGrad = `${id}-tape`;
  const meshGrad = `${id}-mesh`;
  const meshPattern = `${id}-meshPat`;

  return (
    <g aria-hidden>
      <defs>
        <linearGradient id={tapeGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>
        <linearGradient id={meshGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f8fafc" stopOpacity={0.95} />
          <stop offset="100%" stopColor="#cbd5e1" stopOpacity={0.85} />
        </linearGradient>
        <pattern id={meshPattern} width={3} height={3} patternUnits="userSpaceOnUse">
          <path d="M0 3 L3 0" stroke="#64748b" strokeWidth={0.5} opacity={0.65} />
        </pattern>
      </defs>

      <ellipse cx={cx} cy={y + meshH / 2 + 2.5} rx={width * 0.4} ry={2.2} fill="#020617" opacity={0.16} />

      {[x, x + width - postW].map((px) => (
        <g key={`post-${px}`}>
          <rect
            x={px}
            y={tapeY - 1.5}
            width={postW}
            height={postH}
            rx={0.8}
            fill="#ca8a04"
            stroke="#92400e"
            strokeWidth={0.4}
          />
          <line
            x1={px + 0.8}
            y1={tapeY}
            x2={px + 0.8}
            y2={tapeY + postH - 1}
            stroke="#fef08a"
            strokeWidth={0.6}
            opacity={0.7}
          />
        </g>
      ))}

      <rect x={x + 0.5} y={tapeY + 0.4} width={width - 1} height={tapeH} rx={0.5} fill="#94a3b8" opacity={0.35} />
      <rect x={x + 0.5} y={tapeY} width={width - 1} height={tapeH} rx={0.5} fill={`url(#${tapeGrad})`} />
      <rect x={x + 1} y={meshY} width={width - 2} height={meshH} rx={0.5} fill={`url(#${meshGrad})`} />
      <rect x={x + 1.2} y={meshY + 0.3} width={width - 2.4} height={meshH - 0.6} fill={`url(#${meshPattern})`} rx={0.4} />
      <line
        x1={x + 1}
        y1={tapeY + 0.5}
        x2={x + width - 1}
        y2={tapeY + 0.5}
        stroke="#ffffff"
        strokeWidth={0.9}
        opacity={0.9}
      />
    </g>
  );
}
