import { motion, useReducedMotion } from 'framer-motion';

const variantClass: Record<'broadcast' | 'tv', string> = {
  broadcast: 'h-[3.375rem] w-auto max-w-[min(92vw,11rem)] sm:h-[3.75rem]',
  tv: 'h-11 w-auto max-w-[min(36vw,9rem)] sm:h-12 md:h-14',
};

type LiveBandejaRotatingLogoProps = {
  variant?: 'broadcast' | 'tv';
  className?: string;
  alt?: string;
};

export function LiveBandejaRotatingLogo({
  variant = 'broadcast',
  className = '',
  alt = 'Bandeja',
}: LiveBandejaRotatingLogoProps) {
  const reduceMotion = useReducedMotion();
  const base = `pointer-events-none block origin-center object-contain ${variantClass[variant]} ${className}`;

  if (reduceMotion) {
    return <img src="/bandeja2-white-tr.png" alt={alt} className={`${base} rotate-45`} />;
  }

  return (
    <motion.img
      src="/bandeja2-white-tr.png"
      alt={alt}
      className={`${base} will-change-transform`}
      animate={{ rotate: [0, 45, 0] }}
      transition={{
        duration: 10,
        repeat: Infinity,
        ease: [0.22, 1.12, 0.36, 1.06],
      }}
    />
  );
}
