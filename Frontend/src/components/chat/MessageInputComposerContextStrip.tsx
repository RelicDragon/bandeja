import { AnimatePresence, motion } from 'framer-motion';
import type { ChatMessage } from '@/api/chat';
import { EditPreview } from '../EditPreview';
import { ReplyPreview } from '../ReplyPreview';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { PANEL_ENTER_Y, PANEL_EXIT_Y, PANEL_TRANSITION } from '../motion/motionTokens';

interface MessageInputComposerContextStripProps {
  editingMessage: ChatMessage | null;
  replyTo: ChatMessage | null;
  onCancelEdit?: () => void;
  onCancelReply?: () => void;
  onScrollToMessage?: (messageId: string) => void;
}

export function MessageInputComposerContextStrip({
  editingMessage,
  replyTo,
  onCancelEdit,
  onCancelReply,
  onScrollToMessage,
}: MessageInputComposerContextStripProps) {
  const reduceMotion = usePrefersReducedMotion();
  const showEdit = !!editingMessage;
  const showReply = !!replyTo && !editingMessage;
  const visible = showEdit || showReply;
  const panelKey = showEdit ? `edit-${editingMessage!.id}` : showReply ? `reply-${replyTo!.id}` : 'none';

  if (reduceMotion) {
    if (!visible) return null;
    return (
      <div className="mb-2">
        {showEdit ? (
          <EditPreview message={editingMessage!} onCancel={onCancelEdit!} />
        ) : (
          <ReplyPreview
            replyTo={{
              id: replyTo!.id,
              content: replyTo!.content,
              messageType: replyTo!.messageType,
              sender: replyTo!.sender || { id: 'system', firstName: 'System' },
            }}
            onCancel={onCancelReply}
            onScrollToMessage={onScrollToMessage}
          />
        )}
      </div>
    );
  }

  return (
    <AnimatePresence initial={false} mode="wait">
      {visible ? (
        <motion.div
          key={panelKey}
          initial={{ opacity: 0, height: 0, y: PANEL_ENTER_Y }}
          animate={{ opacity: 1, height: 'auto', y: 0 }}
          exit={{ opacity: 0, height: 0, y: PANEL_EXIT_Y }}
          transition={PANEL_TRANSITION}
          className="overflow-hidden mb-2"
        >
          {showEdit ? (
            <EditPreview message={editingMessage!} onCancel={onCancelEdit!} />
          ) : (
            <ReplyPreview
              replyTo={{
                id: replyTo!.id,
                content: replyTo!.content,
                messageType: replyTo!.messageType,
                sender: replyTo!.sender || { id: 'system', firstName: 'System' },
              }}
              onCancel={onCancelReply}
              onScrollToMessage={onScrollToMessage}
            />
          )}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
