type PhotoStoryCropGuideProps = {
  visible: boolean;
};

/** Instagram-style rule-of-thirds + corner brackets while reframing. */
export function PhotoStoryCropGuide({ visible }: PhotoStoryCropGuideProps) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 z-[15] transition-opacity duration-200 ease-out ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      aria-hidden
    >
      {/* Soft vignette so the grid reads on any photo */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.28)_100%)]" />

      {/* Rule of thirds */}
      <div className="absolute left-1/3 top-0 h-full w-px bg-white/30" />
      <div className="absolute left-2/3 top-0 h-full w-px bg-white/30" />
      <div className="absolute left-0 top-1/3 h-px w-full bg-white/30" />
      <div className="absolute left-0 top-2/3 h-px w-full bg-white/30" />

      {/* Corner brackets */}
      <span className="absolute left-2 top-2 h-5 w-5 border-s-2 border-t-2 border-white/85" />
      <span className="absolute right-2 top-2 h-5 w-5 border-e-2 border-t-2 border-white/85" />
      <span className="absolute bottom-2 left-2 h-5 w-5 border-b-2 border-s-2 border-white/85" />
      <span className="absolute bottom-2 right-2 h-5 w-5 border-b-2 border-e-2 border-white/85" />
    </div>
  );
}
