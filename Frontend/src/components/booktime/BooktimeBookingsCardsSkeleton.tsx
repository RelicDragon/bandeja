import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { STAGGER_CHILDREN, STAGGER_DELAY_CHILDREN } from '@/components/motion/motionTokens';
import { BOOKING_CARD_SKELETON_ITEM_TRANSITION } from './booktimeListMotion';
import { BooktimeBookingCardSkeleton } from './BooktimeBookingCardSkeleton';

type Props = {
  count?: number;
  compact?: boolean;
};

export function BooktimeBookingsCardsSkeleton({ count = 3, compact = false }: Props) {
  const reduceMotion = usePrefersReducedMotion();

  return (
    <ul className="space-y-2">
      {Array.from({ length: count }).map((_, index) => {
        const skeleton = <BooktimeBookingCardSkeleton compact={compact} />;
        if (reduceMotion) {
          return <li key={index}>{skeleton}</li>;
        }
        return (
          <motion.li
            key={index}
            initial={{ opacity: 0, y: 10, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              ...BOOKING_CARD_SKELETON_ITEM_TRANSITION,
              delay: STAGGER_DELAY_CHILDREN + index * STAGGER_CHILDREN,
            }}
          >
            {skeleton}
          </motion.li>
        );
      })}
    </ul>
  );
}
