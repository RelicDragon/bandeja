import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Paperclip, Image, ListPlus } from 'lucide-react';
import { pickImages } from '@/utils/photoCapture';
import { isCapacitor } from '@/utils/capacitor';
import { isValidImage } from '@/components/chat/messageInputDraftUtils';

type MessageInputAttachMenuProps = {
  isDisabled: boolean;
  inputBlocked: boolean;
  voiceMode: boolean;
  onAddImages: (files: File[]) => void;
  onOpenPoll: () => void;
};

export function MessageInputAttachMenu({
  isDisabled,
  inputBlocked,
  voiceMode,
  onAddImages,
  onOpenPoll,
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

  const handlePollButtonClick = () => {
    if (isDisabled || inputBlocked) return;
    onOpenPoll();
    setIsAttachExpanded(false);
  };

  return (
    <>
      <div ref={attachMenuRef} className="pb-0.5 relative flex flex-shrink-0 items-end flex-col-reverse">
        <button
          type="button"
          onClick={() => setIsAttachExpanded((prev) => !prev)}
          disabled={isDisabled || inputBlocked || voiceMode}
          className="w-11 h-11 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-[0_4px_12px_rgba(0,0,0,0.15),0_8px_24px_rgba(0,0,0,0.12),0_16px_48px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.3),0_8px_24px_rgba(0,0,0,0.25),0_16px_48px_rgba(0,0,0,0.2)]"
          title={t('chat.attach', 'Attach')}
        >
          <Paperclip size={20} className="text-gray-700 dark:text-gray-300" />
        </button>
        <div
          className={`absolute bottom-full left-0 mb-2 flex flex-col-reverse items-center gap-2 transition-all duration-300 ease-out bg-transparent z-50 ${
            isAttachExpanded ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        >
          <button
            type="button"
            onClick={() => void handleImageButtonClick()}
            disabled={isDisabled || inputBlocked || voiceMode}
            className="w-11 h-11 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-300 shadow-[0_4px_12px_rgba(0,0,0,0.15),0_8px_24px_rgba(0,0,0,0.12),0_16px_48px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.3),0_8px_24px_rgba(0,0,0,0.25),0_16px_48px_rgba(0,0,0,0.2)] hover:scale-105"
            title={t('chat.attachImages', 'Images')}
          >
            <Image size={20} className="text-gray-700 dark:text-gray-300" />
          </button>
          <button
            type="button"
            onClick={handlePollButtonClick}
            disabled={isDisabled || inputBlocked || voiceMode}
            className="w-11 h-11 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-300 shadow-[0_4px_12px_rgba(0,0,0,0.15),0_8px_24px_rgba(0,0,0,0.12),0_16px_48px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.3),0_8px_24px_rgba(0,0,0,0.25),0_16px_48px_rgba(0,0,0,0.2)] hover:scale-105"
            title={t('chat.poll.createTitle', 'Create Poll')}
          >
            <ListPlus size={20} className="text-gray-700 dark:text-gray-300" />
          </button>
        </div>
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
