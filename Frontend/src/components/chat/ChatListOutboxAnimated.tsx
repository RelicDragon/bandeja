import { AnimatePresence, motion } from 'framer-motion';
import type { ChatListOutbox } from '@/utils/chatListSort';
import { ChatListOutboxLine } from './ChatListOutboxLine';

type Props = {
  listOutbox: ChatListOutbox | null | undefined;
  onRetry?: () => void;
  onDismiss?: () => void;
};

export function ChatListOutboxAnimated({ listOutbox, onRetry, onDismiss }: Props) {
  return (
    <AnimatePresence initial={false} mode="popLayout">
      {listOutbox ? (
        <motion.div
          key="outbox"
          layout
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -2 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <ChatListOutboxLine listOutbox={listOutbox} onRetry={onRetry} onDismiss={onDismiss} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
