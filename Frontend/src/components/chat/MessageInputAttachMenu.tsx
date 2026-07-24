import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CHAT_ATTACH_FLYOUT_CONTAINER,
  CHAT_ATTACH_FLYOUT_ITEM,
} from '@/components/chat/chatListMotion';
import { Paperclip, Image, ListPlus, Video, FileText } from 'lucide-react';
import { isValidVideo } from '@/components/chat/messageInputDraftUtils';
import { pickImages } from '@/utils/photoCapture';
import { pickVideo } from '@/utils/videoCapture';
import { pickDocument, isValidChatDocument, chatDocumentRejectReason } from '@/utils/documentCapture';
import { isCapacitor } from '@/utils/capacitor';
import { isValidImage } from '@/components/chat/messageInputDraftUtils';

type MessageInputAttachMenuProps = {
  isDisabled: boolean;
  inputBlocked: boolean;
  voiceMode: boolean;
  onAddImages: (files: File[]) => void;
  onAddVideo: (file: File) => void;
  onAddDocument: (file: File) => void;
  onOpenPoll: () => void;
  videoBusy?: boolean;
};

export function MessageInputAttachMenu({
  isDisabled,
  inputBlocked,
  voiceMode,
  onAddImages,
  onAddVideo,
  onAddDocument,
  onOpenPoll,
  videoBusy = false,
}: MessageInputAttachMenuProps) {
  const { t } = useTranslation();
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isAttachExpanded, setIsAttachExpanded] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setIsAttachExpanded(false);
      }
    };
    if (isAttachExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isAttachExpanded]);

  const handleImageSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const imageFiles = Array.from(files).filter(isValidImage);
    if (imageFiles.length === 0) {
      toast.error(t('chat.invalidImageType'));
      return;
    }
    onAddImages(imageFiles);
  };

  const handleImageButtonClick = async () => {
    if (isDisabled || inputBlocked) return;
    if (isCapacitor()) {
      try {
        const result = await pickImages(10);
        if (result && result.files.length > 0) {
          const validFiles = result.files.filter(isValidImage);
          if (validFiles.length === 0) {
            toast.error(t('chat.invalidImageType'));
            return;
          }
          onAddImages(validFiles);
        }
      } catch (error: unknown) {
        console.error('Error picking images:', error);
        const msg = error instanceof Error ? error.message : '';
        if (msg.includes('too large')) {
          toast.error(msg);
        } else {
          toast.error(t('chat.photoPickFailed') || 'Failed to pick photos');
        }
      }
    } else {
      fileInputRef.current?.click();
    }
    setIsAttachExpanded(false);
  };

  const handleVideoButtonClick = async () => {
    if (isDisabled || inputBlocked || videoBusy) return;
    setIsAttachExpanded(false);
    try {
      const result = await pickVideo();
      if (!result?.file) return;
      if (!isValidVideo(result.file)) {
        toast.error(t('chat.invalidVideoType', { defaultValue: 'Invalid or too large video file' }));
        return;
      }
      onAddVideo(result.file);
    } catch (error: unknown) {
      console.error('Error picking video:', error);
      toast.error(t('chat.videoPickFailed', { defaultValue: 'Failed to pick video' }));
    }
  };

  const handleDocumentButtonClick = async () => {
    if (isDisabled || inputBlocked) return;
    setIsAttachExpanded(false);
    try {
      const result = await pickDocument();
      if (!result?.file) return;
      const reject = chatDocumentRejectReason(result.file);
      if (reject === 'too_large') {
        toast.error(t('chat.documentTooLarge', { defaultValue: 'File is too large (max 32 MB)' }));
        return;
      }
      if (reject === 'invalid_type' || !isValidChatDocument(result.file)) {
        toast.error(
          t('chat.invalidDocumentType', {
            defaultValue: 'Unsupported file type (PDF, DOC, DOCX, TXT)',
          })
        );
        return;
      }
      onAddDocument(result.file);
    } catch (error: unknown) {
      console.error('Error picking document:', error);
      toast.error(t('chat.documentPickFailed', { defaultValue: 'Failed to pick file' }));
    }
  };

  const handlePollButtonClick = () => {
    if (isDisabled || inputBlocked) return;
    onOpenPoll();
    setIsAttachExpanded(false);
  };

  return (
    <>
      <div ref={attachMenuRef} className="relative flex flex-shrink-0 items-end flex-col-reverse">
        <button
          type="button"
          onClick={() => setIsAttachExpanded((prev) => !prev)}
          disabled={isDisabled || inputBlocked || voiceMode}
          className="w-11 h-11 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-[0_2px_6px_rgba(0,0,0,0.16),0_6px_16px_rgba(0,0,0,0.2)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.5),0_8px_20px_rgba(0,0,0,0.45)]"
          title={t('chat.attach', { defaultValue: 'Attach' })}
          data-testid="chat-attach-button"
        >
          <Paperclip size={20} className="text-gray-700 dark:text-gray-300" />
        </button>
        <AnimatePresence>
          {isAttachExpanded ? (
            <motion.div
              key="attach-flyout"
              className="absolute bottom-full left-0 z-50 mb-2 flex flex-col-reverse items-center gap-2 bg-transparent"
              initial="hidden"
              animate="visible"
              exit="hidden"
              variants={CHAT_ATTACH_FLYOUT_CONTAINER}
              data-testid="chat-attach-flyout"
            >
              <motion.button
                type="button"
                variants={CHAT_ATTACH_FLYOUT_ITEM}
                onClick={() => void handleDocumentButtonClick()}
                disabled={isDisabled || inputBlocked || voiceMode}
                className="w-11 h-11 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-[0_2px_6px_rgba(0,0,0,0.16),0_6px_16px_rgba(0,0,0,0.2)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.5),0_8px_20px_rgba(0,0,0,0.45)] hover:scale-105"
                title={t('chat.attachFile', { defaultValue: 'File' })}
                data-testid="chat-attach-file"
              >
                <FileText size={20} className="text-gray-700 dark:text-gray-300" />
              </motion.button>
              <motion.button
                type="button"
                variants={CHAT_ATTACH_FLYOUT_ITEM}
                onClick={() => void handleVideoButtonClick()}
                disabled={isDisabled || inputBlocked || voiceMode || videoBusy}
                className="w-11 h-11 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-[0_2px_6px_rgba(0,0,0,0.16),0_6px_16px_rgba(0,0,0,0.2)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.5),0_8px_20px_rgba(0,0,0,0.45)] hover:scale-105"
                title={t('chat.attachVideo', { defaultValue: 'Video' })}
              >
                <Video size={20} className="text-gray-700 dark:text-gray-300" />
              </motion.button>
              <motion.button
                type="button"
                variants={CHAT_ATTACH_FLYOUT_ITEM}
                onClick={() => void handleImageButtonClick()}
                disabled={isDisabled || inputBlocked || voiceMode}
                className="w-11 h-11 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-[0_2px_6px_rgba(0,0,0,0.16),0_6px_16px_rgba(0,0,0,0.2)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.5),0_8px_20px_rgba(0,0,0,0.45)] hover:scale-105"
                title={t('chat.attachImages', { defaultValue: 'Images' })}
              >
                <Image size={20} className="text-gray-700 dark:text-gray-300" />
              </motion.button>
              <motion.button
                type="button"
                variants={CHAT_ATTACH_FLYOUT_ITEM}
                onClick={handlePollButtonClick}
                disabled={isDisabled || inputBlocked || voiceMode}
                className="w-11 h-11 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-[0_2px_6px_rgba(0,0,0,0.16),0_6px_16px_rgba(0,0,0,0.2)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.5),0_8px_20px_rgba(0,0,0,0.45)] hover:scale-105"
                title={t('chat.poll.createTitle', 'Create Poll')}
              >
                <ListPlus size={20} className="text-gray-700 dark:text-gray-300" />
              </motion.button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => void handleImageSelect(e.target.files)}
        className="hidden"
      />
    </>
  );
}
