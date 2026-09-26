/**
 * The watch page's backdrop: two soft light pools — the member's primary
 * colour over the far end, a lime ball-glow under the near end. Static
 * gradients, no blur filter, so it costs one paint.
 */
export function WatchAmbient({ light }: { light: boolean }) {
  const primary = `color-mix(in srgb, var(--member-primary-500, #0ea5e9) ${light ? 18 : 30}%, transparent)`;
  const lime = light ? 'rgba(163, 230, 53, 0.14)' : 'rgba(163, 230, 53, 0.09)';
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div
        className="absolute -top-[28vh] left-1/2 h-[75vh] w-[150vw] max-w-[1400px] -translate-x-1/2"
        style={{ background: `radial-gradient(closest-side, ${primary}, transparent)` }}
      />
      <div
        className="absolute -bottom-[30vh] left-1/2 h-[60vh] w-[120vw] max-w-[1100px] -translate-x-1/2"
        style={{ background: `radial-gradient(closest-side, ${lime}, transparent)` }}
      />
    </div>
  );
}
