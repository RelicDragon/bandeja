type LiveServeBallIndicatorProps = {
  /** Sits in normal flow after a name (e.g. TV roster), not on the avatar corner */
  inline?: boolean;
};

/** FIP-style high-viz padel ball (fluo yellow–lime, not warm tennis amber) */
const ballFill =
  'rounded-full border border-lime-950/30 bg-gradient-to-br from-[#f4ff9a] via-[#e8fc38] to-[#b8cf0a]';

const overlayBall = `${ballFill} shadow-[inset_0_1px_1px_rgba(255,255,255,0.65),inset_0_-2px_3px_rgba(0,0,0,0.14),0_1px_2px_rgba(0,0,0,0.35),0_0_10px_rgba(220,252,80,0.55)]`;

const inlineBall = `${ballFill} shadow-[inset_0_1px_2px_rgba(255,255,255,0.75),inset_0_-2px_3px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.3),0_0_14px_rgba(220,252,80,0.6)]`;

export function LiveServeBallIndicator({ inline }: LiveServeBallIndicatorProps) {
  if (inline) {
    return (
      <span
        role="img"
        aria-label="Serving"
        className={`pointer-events-none inline-block shrink-0 ${inlineBall} size-[clamp(0.55rem,1.8vw,0.95rem)] md:size-4`}
      />
    );
  }
  return (
    <span
      role="img"
      aria-label="Serving"
      className={`pointer-events-none absolute -bottom-0.5 -right-0.5 size-2.5 ${overlayBall}`}
    />
  );
}
