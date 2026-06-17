import { motion } from 'framer-motion';
import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { CONTENT_ENTER_Y, STAGGER_CHILDREN, STAGGER_DELAY_CHILDREN, STAGGER_ITEM_TRANSITION } from './motionTokens';

interface AnimatedChildrenStaggerProps {
  children: ReactNode;
  contentKey: string;
  className?: string;
}

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

  const items = flattenChildren(children);

  return (
    <div key={contentKey} className={className}>
      {items.map((child, index) => {
        const childKey = isValidElement(child) && child.key != null ? String(child.key) : `stagger-${index}`;
        const delay = STAGGER_DELAY_CHILDREN + index * STAGGER_CHILDREN;
        return (
          <motion.div
            key={childKey}
            initial={{ opacity: 0, y: CONTENT_ENTER_Y, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ ...STAGGER_ITEM_TRANSITION, delay }}
          >
            {child}
          </motion.div>
        );
      })}
    </div>
  );
}
