/**
 * The reduced-motion guard for CSS press feedback (CONTRACT §7.1 — "every
 * motion path must be gated on `usePrefersReducedMotion()`").
 *
 * Framer's `whileTap` is gated in JS, but a Tailwind `active:scale-*` is pure
 * CSS and needs the `motion-reduce:` variant instead. Append this next to the
 * `active:scale-*` a control already owns, rather than hand-writing the pair at
 * each call site — the same role `shimmerBlock` plays for skeletons:
 *
 *   className={`… active:scale-[0.98] ${pressScaleGuard}`}
 *
 * **Why not `motion-reduce:transform-none`.** In Tailwind v4 `scale-*` compiles
 * to the standalone `scale` property, not to `transform`, so `transform: none`
 * does not undo it — the obvious guard is a silent no-op. The override has to
 * be another `scale` utility, and it has to match the target's specificity:
 * `.active\:scale-95:active` is (0,2,0) and `.enabled\:active\:scale-*` is
 * (0,3,0), so both variants are included here. Tailwind emits `motion-reduce:`
 * (a media variant) after the plain pseudo-class rules, so the later, equally
 * specific rule wins.
 *
 * Every class name is written out literally so Tailwind's source scan sees it.
 */
export const pressScaleGuard =
  'motion-reduce:active:scale-100 motion-reduce:enabled:active:scale-100 motion-reduce:transition-none';
