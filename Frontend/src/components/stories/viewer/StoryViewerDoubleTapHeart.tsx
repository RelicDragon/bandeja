import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Heart } from 'lucide-react';

type StoryViewerDoubleTapHeartProps = {
  burst: { x: number; y: number } | null;
};

export function StoryViewerDoubleTapHeart({ burst }: StoryViewerDoubleTapHeartProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion || !burst) return null;

  return (
    <AnimatePresence>
      <motion.div
        key={`${burst.x}-${burst.y}`}
        className="pointer-events-none fixed z-[45] -translate-x-1/2 -translate-y-1/2"
        style={{ left: burst.x, top: burst.y }}
        initial={{ scale: 0.4, opacity: 1 }}
        animate={{ scale: 1.4, opacity: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.65, ease: 'easeOut' }}
      >
        <Heart size={88} className="fill-red-500 text-red-500 drop-shadow-lg" strokeWidth={0} />
      </motion.div>
    </AnimatePresence>
  );
}
