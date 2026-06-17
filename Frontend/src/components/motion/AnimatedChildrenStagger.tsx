import { motion, type Variants } from 'framer-motion';
import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { CONTENT_ENTER_Y, STAGGER_CHILDREN, STAGGER_DELAY_CHILDREN, STAGGER_ITEM_TRANSITION } from './motionTokens';

interface AnimatedChildrenStaggerProps {
  children: ReactNode;
  contentKey: string;
  className?: string;
}

const containerVariants: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: STAGGER_CHILDREN,
      delayChildren: STAGGER_DELAY_CHILDREN,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: CONTENT_ENTER_Y, scale: 0.99 },
  show: { opacity: 1, y: 0, scale: 1, transition: STAGGER_ITEM_TRANSITION },
};

function flattenChildren(children: ReactNode): ReactNode[] {
  const result: ReactNode[] = [];
  Children.forEach(children, (child) => {
    if (isValidElement(child) && child.type === Fragment) {
      result.push(...flattenChildren((child.props as { children?: ReactNode }).children));
    } else if (child !== null && child !== undefined && child !== false) {
      result.push(child);
    }
  });
  return result;
}

export function AnimatedChildrenStagger({ children, contentKey, className }: AnimatedChildrenStaggerProps) {
  const reduceMotion = usePrefersReducedMotion();

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      key={contentKey}
      className={className}
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {flattenChildren(children).map((child, index) => {
        const childKey = isValidElement(child) && child.key != null ? String(child.key) : `stagger-${index}`;
        return (
          <motion.div key={childKey} variants={itemVariants}>
            {child}
          </motion.div>
        );
      })}
    </motion.div>
  );
}
