import { motion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  className?: string;
  entryVariants?: Variants;
};

export function BooktimeBookingListItem({ children, className, entryVariants }: Props) {
  if (entryVariants) {
    return (
      <motion.li variants={entryVariants} className={className}>
        {children}
      </motion.li>
    );
  }
  return <li className={className}>{children}</li>;
}
