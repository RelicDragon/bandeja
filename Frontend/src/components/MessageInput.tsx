import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { chatApi, CreateMessageRequest, ChatMessage } from '@/api/chat';
import { mediaApi } from '@/api/media';
import { ChatType } from '@/types';
import { ReplyPreview } from './ReplyPreview';
import { Image, X } from 'lucide-react';

interface MessageInputProps {
  gameId?: string;
  bugId?: string;
  userChatId?: string;
  onMessageSent: () => void;
  disabled?: boolean;
  replyTo?: ChatMessage | null;
  onCancelReply?: () => void;
  onScrollToMessage?: (messageId: string) => void;
  chatType?: ChatType;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  gameId,
  bugId,
  userChatId,
  onMessageSent,
  disabled = false,
  replyTo,
  onCancelReply,
  onScrollToMessage,
  chatType = 'PUBLIC',
}) => {
  const { t } = useTranslation();
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const imagePreviewUrls = useMemo(() => {
    return selectedImages.map(file => URL.createObjectURL(file));
  }, [selectedImages]);

  useEffect(() => {
    return () => {
      imagePreviewUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [imagePreviewUrls]);

  useEffect(() => {
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      const singleRowHeight = 48; // minHeight from style
      const maxHeight = 120; // maxHeight from style
      
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      
      if (scrollHeight <= singleRowHeight) {
        textarea.style.height = `${singleRowHeight}px`;
        textarea.style.overflowY = 'hidden';
      } else {
        const newHeight = Math.min(scrollHeight, maxHeight);
        textarea.style.height = `${newHeight}px`;
        // Only show scrollbar if content actually overflows the container
        textarea.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
      }
    }
  }, [message]);

  const handleImageSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const imageFiles = Array.from(files).filter(file => 
      file.type.startsWith('image/') && file.size <= 10 * 1024 * 1024 // 10MB limit
    );

    if (imageFiles.length === 0) {
      toast.error(t('chat.invalidImageType'));
      return;
    }

    setSelectedImages(prev => [...prev, ...imageFiles]);
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  const uploadImages = async (): Promise<{ originalUrls: string[]; thumbnailUrls: string[] }> => {
    if (selectedImages.length === 0) return { originalUrls: [], thumbnailUrls: [] };

    const targetId = gameId || bugId || userChatId;
    if (!targetId) return { originalUrls: [], thumbnailUrls: [] };

    const uploadPromises = selectedImages.map(async (file) => {
      try {
        const response = await mediaApi.uploadChatImage(file, targetId);
        return {
          originalUrl: response.originalUrl,
          thumbnailUrl: response.thumbnailUrl
        };
      } catch (error) {
        console.error('Failed to upload image:', error);
        throw error;
      }
    });

    const results = await Promise.all(uploadPromises);
    return {
      originalUrls: results.map(r => r.originalUrl),
      thumbnailUrls: results.map(r => r.thumbnailUrl)
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!message.trim() && selectedImages.length === 0) || isLoading || disabled) return;

    setIsLoading(true);
    try {
      const { originalUrls, thumbnailUrls } = await uploadImages();

      const trimmedContent = message.trim();

      const messageData: CreateMessageRequest = {
        chatContextType: gameId ? 'GAME' : bugId ? 'BUG' : 'USER',
        contextId: gameId || bugId || userChatId,
        gameId: gameId, // Keep for backward compatibility
        content: trimmedContent || undefined,
        mediaUrls: originalUrls.length > 0 ? originalUrls : undefined,
        thumbnailUrls: thumbnailUrls.length > 0 ? thumbnailUrls : undefined,
        replyToId: replyTo?.id,
        chatType: userChatId ? 'PUBLIC' : chatType,
      };

      await chatApi.createMessage(messageData);

      setMessage('');
      setSelectedImages([]);
      onCancelReply?.();
      onMessageSent();
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-4">
      {replyTo && (
        <ReplyPreview
          replyTo={replyTo.replyTo || {
            id: replyTo.id,
            content: replyTo.content,
            sender: replyTo.sender || { id: 'system', firstName: 'System' }
          }}
          onCancel={onCancelReply}
          onScrollToMessage={onScrollToMessage}
          className="mb-3"
        />
      )}

      {selectedImages.length > 0 && (
        <div className="mb-3 flex gap-2 overflow-x-auto">
          {imagePreviewUrls.map((url, index) => (
            <div key={index} className="relative flex-shrink-0">
              <img
                src={url}
                alt={`Preview ${index + 1}`}
                className="w-16 h-16 object-cover rounded-lg border border-gray-200 dark:border-gray-600"
              />
              <button
                onClick={() => removeImage(index)}
                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600 transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.messages.typeMessage')}
            disabled={disabled || isLoading}
            className="w-full px-4 py-3 pr-20 border border-gray-300 dark:border-gray-600 rounded-2xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
            rows={1}
            style={{ minHeight: '48px', maxHeight: '120px', overflowY: 'auto' }}
          />
          
          <div className="absolute bottom-2.5 right-1.5 flex items-center gap-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isLoading}
              className="w-8 h-8 bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-full flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Image size={16} />
            </button>
            
            <button
              type="submit"
              disabled={(!message.trim() && selectedImages.length === 0) || isLoading || disabled}
              className="w-10 h-10 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-full flex items-center justify-center hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      </form>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => handleImageSelect(e.target.files)}
        className="hidden"
      />
    </div>
  );
};
