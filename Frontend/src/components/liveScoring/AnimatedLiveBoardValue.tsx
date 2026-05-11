import { motion, useReducedMotion } from 'framer-motion';

type AnimatedLiveBoardValueProps = {
  value: string | number;
  className?: string;
  intensity?: 'normal' | 'impact';
};

export function AnimatedLiveBoardValue({ value, className, intensity = 'normal' }: AnimatedLiveBoardValueProps) {
  const reduceMotion = useReducedMotion();
  const isImpact = intensity === 'impact';
  if (reduceMotion) {
    return <span className={className}>{value}</span>;
  }
  return (
    <motion.span
      key={String(value)}
      className={className}
      style={{ display: 'inline-block', transformOrigin: 'center 70%' }}
      initial={
        isImpact
          ? { scale: 1.14, y: '-0.06em', opacity: 0.55, filter: 'blur(2px)' }
          : { scale: 1.1, y: '-0.04em', opacity: 0.6, filter: 'blur(1px)' }
      }
      animate={{ scale: 1, y: 0, opacity: 1, filter: 'blur(0px)' }}
      transition={
        isImpact
          ? { type: 'spring', stiffness: 280, damping: 20, mass: 0.72 }
          : { type: 'spring', stiffness: 400, damping: 26, mass: 0.55 }
      }
    >
      {value}
    </motion.span>
  );
}
