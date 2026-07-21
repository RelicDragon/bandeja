import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

const ease = [0.22, 1, 0.36, 1] as const;

interface LoginPanelFrameProps {
  panelKey: string;
  direction: number;
  children: ReactNode;
}

export function LoginPanelFrame({ panelKey, direction, children }: LoginPanelFrameProps) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | 'auto'>('auto');
  const reduceMotion = useReducedMotion();

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;

    const update = () => {
      // scrollHeight + ceil: avoid subpixel clip of descenders / underlines
      setHeight(Math.ceil(el.scrollHeight));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [panelKey, children]);

  if (reduceMotion) {
    return <div>{children}</div>;
  }

  return (
    <motion.div
      className="overflow-hidden"
      initial={false}
      animate={{ height: typeof height === 'number' ? height : undefined }}
      transition={{ duration: 0.38, ease }}
    >
      <div ref={measureRef} className="pb-px">
        <AnimatePresence initial={false} mode="wait" custom={direction}>
          <motion.div
            key={panelKey}
            custom={direction}
            initial="enter"
            animate="center"
            exit="exit"
            variants={{
              enter: (dir: number) => ({ opacity: 0, x: dir * 28 }),
              center: { opacity: 1, x: 0 },
              exit: (dir: number) => ({ opacity: 0, x: dir * -22 }),
            }}
            transition={{ duration: 0.3, ease }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
