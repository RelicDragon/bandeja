import { useState } from 'react';
import { motion } from 'framer-motion';
import { ImageIcon } from 'lucide-react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

interface MarketItemCardMediaProps {
  imageUrl?: string;
  title: string;
  mediaCount?: number;
  inactive?: boolean;
}

export function MarketItemCardMedia({ imageUrl, title, mediaCount = 0, inactive = false }: MarketItemCardMediaProps) {
  const reduceMotion = usePrefersReducedMotion();
  const [loaded, setLoaded] = useState(false);

  if (!imageUrl) {
    return (
      <div className="relative flex aspect-square flex-shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-slate-100 via-slate-50 to-primary-50 dark:from-slate-800 dark:via-slate-800 dark:to-primary-950/40">
        <ImageIcon size={28} className="text-slate-300 dark:text-slate-600" strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <div
      className={`relative aspect-square flex-shrink-0 overflow-hidden bg-slate-100 dark:bg-slate-700/80 ${inactive ? 'grayscale' : ''}`}
    >
      {!loaded && <div className={`absolute inset-0 ${inactive ? '' : 'animate-pulse bg-slate-200 dark:bg-slate-700'}`} />}
      <motion.img
        src={imageUrl}
        alt={title}
        onLoad={() => setLoaded(true)}
        initial={reduceMotion ? false : { opacity: 0, scale: 1.04 }}
        animate={{ opacity: loaded ? 1 : 0, scale: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className={`h-full w-full object-cover transition-transform duration-300 ${inactive ? '' : 'group-hover:scale-105'}`}
      />
      {mediaCount > 1 && (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.12, type: 'spring', stiffness: 360, damping: 22 }}
          className="absolute bottom-1 right-1 rounded-full bg-black/60 px-1.5 py-px text-[10px] font-medium text-white dark:bg-black/70"
        >
          {mediaCount}
        </motion.div>
      )}
    </div>
  );
}
