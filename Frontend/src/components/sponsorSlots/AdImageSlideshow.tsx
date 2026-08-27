import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

const FRAME_DURATION_MS = 6000;
const CROSSFADE_DURATION_SECONDS = 0.9;

const PAN_ZOOM_PATHS = [
  { from: { scale: 1.03, x: '-1.5%', y: '-1%' }, to: { scale: 1.12, x: '1%', y: '1.25%' } },
  { from: { scale: 1.12, x: '1.25%', y: '-1%' }, to: { scale: 1.04, x: '-1%', y: '1%' } },
  { from: { scale: 1.04, x: '-1%', y: '1.25%' }, to: { scale: 1.11, x: '1.5%', y: '-1%' } },
] as const;

type AdImageSlideshowProps = {
  frames: string[];
  alt: string;
};

export function AdImageSlideshow({ frames, alt }: AdImageSlideshowProps) {
  const reduceMotion = usePrefersReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);
  const safeIndex = activeIndex % frames.length;

  useEffect(() => {
    if (reduceMotion || frames.length <= 1) return;
    const interval = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % frames.length);
    }, FRAME_DURATION_MS);
    return () => window.clearInterval(interval);
  }, [frames.length, reduceMotion]);

  useEffect(() => {
    if (reduceMotion || frames.length <= 1) return;
    const nextImage = new Image();
    nextImage.src = frames[(safeIndex + 1) % frames.length];
    return () => {
      nextImage.src = '';
    };
  }, [frames, reduceMotion, safeIndex]);

  if (reduceMotion || frames.length <= 1) {
    return (
      <img
        src={frames[0]}
        alt={alt}
        className="h-full w-full object-cover"
        loading="lazy"
        decoding="async"
      />
    );
  }

  const path = PAN_ZOOM_PATHS[safeIndex % PAN_ZOOM_PATHS.length];

  return (
    <div className="absolute inset-0" role="img" aria-label={alt}>
      <AnimatePresence>
        <motion.img
          key={`${safeIndex}-${frames[safeIndex]}`}
          src={frames[safeIndex]}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover will-change-transform"
          loading={safeIndex === 0 ? 'lazy' : 'eager'}
          decoding="async"
          initial={{ opacity: 0, ...path.from }}
          animate={{ opacity: 1, ...path.to }}
          exit={{ opacity: 0 }}
          transition={{
            opacity: { duration: CROSSFADE_DURATION_SECONDS, ease: [0.16, 1, 0.3, 1] },
            scale: { duration: FRAME_DURATION_MS / 1000, ease: 'linear' },
            x: { duration: FRAME_DURATION_MS / 1000, ease: 'linear' },
            y: { duration: FRAME_DURATION_MS / 1000, ease: 'linear' },
          }}
        />
      </AnimatePresence>
    </div>
  );
}
