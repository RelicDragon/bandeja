import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { PANEL_TRANSITION } from '@/components/motion/motionTokens';

interface MarketItemImageCarouselProps {
  mediaUrls: string[];
  title: string;
  onImageClick: (url: string) => void;
}

export function MarketItemImageCarousel({ mediaUrls, title, onImageClick }: MarketItemImageCarouselProps) {
  const reduceMotion = usePrefersReducedMotion();
  const [imageIndex, setImageIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const hasMultipleImages = mediaUrls.length > 1;

  const goTo = (next: number) => {
    setDirection(next > imageIndex ? 1 : -1);
    setImageIndex(next);
  };

  const goPrev = () => goTo((imageIndex - 1 + mediaUrls.length) % mediaUrls.length);
  const goNext = () => goTo((imageIndex + 1) % mediaUrls.length);

  const slideVariants = {
    enter: (d: number) => ({
      x: reduceMotion ? 0 : d > 0 ? '100%' : '-100%',
      opacity: reduceMotion ? 1 : 0,
    }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({
      x: reduceMotion ? 0 : d > 0 ? '-100%' : '100%',
      opacity: reduceMotion ? 1 : 0,
    }),
  };

  return (
    <div className="relative flex-shrink-0">
      <div className="relative aspect-square overflow-hidden bg-slate-100 dark:bg-slate-800">
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.img
            key={mediaUrls[imageIndex]}
            src={mediaUrls[imageIndex]}
            alt={title}
            role="button"
            tabIndex={0}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={PANEL_TRANSITION}
            onClick={() => onImageClick(mediaUrls[imageIndex])}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onImageClick(mediaUrls[imageIndex]);
              }
            }}
            className="absolute inset-0 h-full w-full cursor-zoom-in object-cover"
            drag={hasMultipleImages && !reduceMotion ? 'x' : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.12}
            onDragEnd={(_, info) => {
              if (info.offset.x < -48) goNext();
              else if (info.offset.x > 48) goPrev();
            }}
          />
        </AnimatePresence>
      </div>

      {hasMultipleImages && (
        <>
          <motion.button
            type="button"
            onClick={goPrev}
            className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
            whileTap={reduceMotion ? undefined : { scale: 0.92 }}
            aria-label="Previous image"
          >
            <ChevronLeft size={20} />
          </motion.button>
          <motion.button
            type="button"
            onClick={goNext}
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
            whileTap={reduceMotion ? undefined : { scale: 0.92 }}
            aria-label="Next image"
          >
            <ChevronRight size={20} />
          </motion.button>
          <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
            {mediaUrls.map((_, i) => (
              <motion.button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                className="rounded-full"
                animate={{
                  width: i === imageIndex ? 16 : 6,
                  height: 6,
                  backgroundColor: i === imageIndex ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.45)',
                }}
                transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                aria-label={`Image ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
