import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

const openTransition = {
  opacity: { duration: 0.14, ease: [0.22, 1, 0.36, 1] as const },
  scale: { duration: 0.16, ease: [0.22, 1, 0.36, 1] as const },
};

const sizeTransition = {
  type: 'spring' as const,
  stiffness: 520,
  damping: 40,
};

type MentionSuggestionsContainerProps = {
  children: React.ReactNode;
};

export function MentionSuggestionsContainer({ children }: MentionSuggestionsContainerProps) {
  const reduceMotion = useReducedMotion();

  if (!React.isValidElement(children) || reduceMotion) {
    return <>{children}</>;
  }

  const ul = children as React.ReactElement<{
    className?: string;
    style?: React.CSSProperties;
    ref?: React.Ref<HTMLUListElement>;
    id?: string;
    role?: string;
    'aria-label'?: string;
    children?: React.ReactNode;
  }>;
  const { className, style, ref, children: listChildren, ...ulProps } = ul.props;
  const listClassName = ['mention-suggestions-list', className].filter(Boolean).join(' ');

  return (
    <div className="mention-suggestions-shell">
      <motion.ul
        layout="size"
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ ...openTransition, layout: sizeTransition }}
        ref={ref}
        style={{
          ...style,
          transformOrigin: 'bottom center',
        }}
        className={listClassName}
        {...ulProps}
      >
        {listChildren}
      </motion.ul>
    </div>
  );
}
