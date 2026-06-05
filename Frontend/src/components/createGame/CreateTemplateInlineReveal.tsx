import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';

type Props = {
  open: boolean;
  children: ReactNode;
};

export function CreateTemplateInlineReveal({ open, children }: Props) {
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="inline-panel"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: 'easeInOut' }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
