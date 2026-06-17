import { AnimatePresence, motion } from 'framer-motion';
import type { ChatMessage } from '@/api/chat';
import { EditPreview } from '../EditPreview';
import { ReplyPreview } from '../ReplyPreview';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useThreadScroll } from '@/pages/GameChat/useThreadView';
import { COMPOSER_ELEVATED_PANEL_SHADOW } from '@/components/chat/composerElevatedPanel';
import { PANEL_ENTER_Y, PANEL_EXIT_Y } from '../motion/motionTokens';
import { CHAT_PANEL_TRANSITION } from '@/components/chat/chatListMotion';

const elevatedPreviewClassName = COMPOSER_ELEVATED_PANEL_SHADOW;
const stripMotionClassName = 'mb-2 overflow-visible px-0.5 pt-1';

interface MessageInputComposerContextStripProps {
  editingMessage: ChatMessage | null;
  replyTo: ChatMessage | null;
  onCancelEdit?: () => void;
  onCancelReply?: () => void;
}

export function MessageInputComposerContextStrip({
  editingMessage,
  replyTo,
  onCancelEdit,
  onCancelReply,
}: MessageInputComposerContextStripProps) {
  const { handleScrollToMessage: onScrollToMessage } = useThreadScroll();
  const reduceMotion = usePrefersReducedMotion();
  const showEdit = !!editingMessage;
  const showReply = !!replyTo && !editingMessage;
  const visible = showEdit || showReply;
  const panelKey = showEdit ? `edit-${editingMessage!.id}` : showReply ? `reply-${replyTo!.id}` : 'none';

  if (reduceMotion) {
    if (!visible) return null;
    return (
      <div className={stripMotionClassName}>
        {showEdit ? (
          <EditPreview message={editingMessage!} onCancel={onCancelEdit!} className={elevatedPreviewClassName} />
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
            className={elevatedPreviewClassName}
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
          initial={{ opacity: 0, y: PANEL_ENTER_Y }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: PANEL_EXIT_Y }}
          transition={CHAT_PANEL_TRANSITION}
          className={stripMotionClassName}
        >
          {showEdit ? (
            <EditPreview message={editingMessage!} onCancel={onCancelEdit!} className={elevatedPreviewClassName} />
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
              className={elevatedPreviewClassName}
            />
          )}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
