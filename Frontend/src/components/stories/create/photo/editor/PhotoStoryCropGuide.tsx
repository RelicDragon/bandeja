type PhotoStoryCropGuideProps = {
  visible: boolean;
};

/** Rule-of-thirds guide shown while reframing the background photo (IG crop feel). */
export function PhotoStoryCropGuide({ visible }: PhotoStoryCropGuideProps) {
  if (!visible) return null;
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[15] transition-opacity duration-150"
      aria-hidden
    >
      <div className="absolute inset-0 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.22)]" />
      <div className="absolute left-1/3 top-0 h-full w-px bg-white/25" />
      <div className="absolute left-2/3 top-0 h-full w-px bg-white/25" />
      <div className="absolute left-0 top-1/3 h-px w-full bg-white/25" />
      <div className="absolute left-0 top-2/3 h-px w-full bg-white/25" />
    </div>
  );
}
