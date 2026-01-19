import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { chatApi, CreateMessageRequest, ChatMessage, ChatContextType, GroupChannel } from '@/api/chat';
import { mediaApi } from '@/api/media';
import { ChatType, Game, Bug } from '@/types';
import { normalizeChatType } from '@/utils/chatType';
import { isGroupChannelOwner } from '@/utils/gameResults';
import { ReplyPreview } from './ReplyPreview';
import { MentionInput } from './MentionInput';
import { Image, X } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { pickImages } from '@/utils/photoCapture';
import { isCapacitor } from '@/utils/capacitor';

interface MessageInputProps {
  gameId?: string;
  bugId?: string;
  userChatId?: string;
  groupChannelId?: string;
  game?: Game | null;
  bug?: Bug | null;
  groupChannel?: GroupChannel | null;
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
  groupChannelId,
  game,
  bug,
  groupChannel,
  onMessageSent,
  disabled = false,
  replyTo,
  onCancelReply,
  onScrollToMessage,
  chatType = 'PUBLIC',
}) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [message, setMessage] = useState('');
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveDraftTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasLoadedDraftRef = useRef(false);

  const contextType: ChatContextType = gameId ? 'GAME' : bugId ? 'BUG' : groupChannelId ? 'GROUP' : 'USER';
  const finalContextId = gameId || bugId || userChatId || groupChannelId;

  const isChannelOwner = groupChannel?.isChannel && user && groupChannel ? isGroupChannelOwner(groupChannel, user.id) : false;
  const isChannelNonOwner = groupChannel?.isChannel && !isChannelOwner;
  const isDisabledForChannel = isChannelNonOwner || disabled;

  const isValidImage = (file: File): boolean => {
    return file.type.startsWith('image/') && file.size <= 10 * 1024 * 1024;
  };

  const imagePreviewUrls = useMemo(() => {
    return selectedImages.map(file => URL.createObjectURL(file));
  }, [selectedImages]);

  useEffect(() => {
    return () => {
      imagePreviewUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [imagePreviewUrls]);

  const saveDraft = useCallback(async (content: string, mentionIds: string[]) => {
    if (!finalContextId || !user?.id) return;

    const trimmedContent = content?.trim();
    if (!trimmedContent && mentionIds.length === 0) {
      return;
    }

    try {
      const savedDraft = await chatApi.saveDraft({
        chatContextType: contextType,
        contextId: finalContextId,
        chatType: userChatId ? 'PUBLIC' : normalizeChatType(chatType),
        content: trimmedContent || undefined,
        mentionIds: mentionIds.length > 0 ? mentionIds : undefined
      });
      
      window.dispatchEvent(new CustomEvent('draft-updated', {
        detail: {
          draft: savedDraft,
          chatContextType: contextType,
          contextId: finalContextId
        }
      }));
    } catch (error) {
      console.error('Failed to save draft:', error);
    }
  }, [finalContextId, user?.id, contextType, chatType, userChatId]);

  const debouncedSaveDraft = useCallback((content: string, mentionIds: string[]) => {
    if (saveDraftTimeoutRef.current) {
      clearTimeout(saveDraftTimeoutRef.current);
    }

    saveDraftTimeoutRef.current = setTimeout(() => {
      saveDraft(content, mentionIds);
      saveDraftTimeoutRef.current = null;
    }, 800);
  }, [saveDraft]);

  const messageRef = useRef(message);
  const mentionIdsRef = useRef(mentionIds);

  useEffect(() => {
    messageRef.current = message;
    mentionIdsRef.current = mentionIds;
  }, [message, mentionIds]);

  const loadDraft = useCallback(async () => {
    if (!finalContextId || !user?.id || hasLoadedDraftRef.current) return;

    hasLoadedDraftRef.current = true;

    if (saveDraftTimeoutRef.current) {
      clearTimeout(saveDraftTimeoutRef.current);
      saveDraftTimeoutRef.current = null;
    }

    try {
      const draft = await chatApi.getDraft(
        contextType,
        finalContextId,
        userChatId ? 'PUBLIC' : normalizeChatType(chatType)
      );

      if (draft) {
        const hasUserTyped = messageRef.current.trim().length > 0 || mentionIdsRef.current.length > 0;
        if (!hasUserTyped) {
          setMessage(draft.content || '');
          setMentionIds(draft.mentionIds || []);
        }
      }
    } catch (error) {
      console.error('Failed to load draft:', error);
    }
  }, [finalContextId, user?.id, contextType, chatType, userChatId]);

  useEffect(() => {
    if (saveDraftTimeoutRef.current) {
      clearTimeout(saveDraftTimeoutRef.current);
      saveDraftTimeoutRef.current = null;
    }
    hasLoadedDraftRef.current = false;
    setMessage('');
    setMentionIds([]);
    loadDraft();
  }, [finalContextId, contextType, chatType, loadDraft]);

  useEffect(() => {
    return () => {
      if (saveDraftTimeoutRef.current) {
        clearTimeout(saveDraftTimeoutRef.current);
        saveDraftTimeoutRef.current = null;
        
        if (finalContextId && user?.id) {
          const currentMessage = messageRef.current?.trim();
          const currentMentionIds = mentionIdsRef.current || [];
          
          if (currentMessage || currentMentionIds.length > 0) {
            saveDraft(currentMessage || '', currentMentionIds).catch(error => {
              console.error('Failed to save draft on unmount:', error);
            });
          }
        }
      }
    };
  }, [finalContextId, user?.id, saveDraft]);


  const handleImageSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const imageFiles = Array.from(files).filter(isValidImage);

    if (imageFiles.length === 0) {
      toast.error(t('chat.invalidImageType'));
      return;
    }

    setSelectedImages(prev => [...prev, ...imageFiles]);
  };

  const handleImageButtonClick = async () => {
    if (isDisabledForChannel || isLoading) return;

    if (isCapacitor()) {
      try {
        const result = await pickImages(10);
        if (result && result.files.length > 0) {
          const validFiles = result.files.filter(isValidImage);

          if (validFiles.length === 0) {
            toast.error(t('chat.invalidImageType'));
            return;
          }

          setSelectedImages(prev => [...prev, ...validFiles]);
        }
      } catch (error: any) {
        console.error('Error picking images:', error);
        if (error.message?.includes('too large')) {
          toast.error(error.message);
        } else {
          toast.error(t('chat.photoPickFailed') || 'Failed to pick photos');
        }
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const removeImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  const uploadImages = async (): Promise<{ originalUrls: string[]; thumbnailUrls: string[] }> => {
    if (selectedImages.length === 0) return { originalUrls: [], thumbnailUrls: [] };

    const targetId = gameId || bugId || userChatId || groupChannelId;
    if (!targetId) return { originalUrls: [], thumbnailUrls: [] };

    const uploadPromises = selectedImages.map(async (file) => {
      try {
        const response = await mediaApi.uploadChatImage(file, targetId, contextType);
        return {
          success: true as const,
          originalUrl: response.originalUrl,
          thumbnailUrl: response.thumbnailUrl
        };
      } catch (error) {
        console.error('Failed to upload image:', error);
        return {
          success: false as const,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });

    const results = await Promise.allSettled(uploadPromises);
    
    const successful = results
      .filter((result): result is PromiseFulfilledResult<{ success: true; originalUrl: string; thumbnailUrl: string }> => 
        result.status === 'fulfilled' && result.value.success === true
      )
      .map(result => result.value);

    const failed = results.filter(result => 
      result.status === 'rejected' || 
      (result.status === 'fulfilled' && result.value.success === false)
    );

    if (failed.length > 0) {
      console.warn(`${failed.length} image(s) failed to upload`);
      if (successful.length === 0) {
        throw new Error('All images failed to upload');
      }
      toast.error(t('chat.someImagesFailed') || `${failed.length} image(s) failed to upload`);
    }

    return {
      originalUrls: successful.map(r => r.originalUrl),
      thumbnailUrls: successful.map(r => r.thumbnailUrl)
    };
  };

  const handleMessageChange = (newValue: string, newMentionIds: string[]) => {
    setMessage(newValue);
    setMentionIds(newMentionIds);
    debouncedSaveDraft(newValue, newMentionIds);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!message.trim() && selectedImages.length === 0) || isLoading || isDisabledForChannel) return;

    if (!finalContextId) {
      console.error('[MessageInput] Missing contextId:', { gameId, bugId, userChatId, groupChannelId });
      toast.error(t('chat.missingContextId') || 'Missing chat context');
      return;
    }

    setIsLoading(true);
    onMessageSent();
    
    try {
      const { originalUrls, thumbnailUrls } = await uploadImages();

      const trimmedContent = message.trim();

      const messageData: CreateMessageRequest = {
        chatContextType: gameId ? 'GAME' : bugId ? 'BUG' : groupChannelId ? 'GROUP' : 'USER',
        contextId: finalContextId,
        gameId: gameId, // Keep for backward compatibility
        content: trimmedContent || undefined,
        mediaUrls: originalUrls.length > 0 ? originalUrls : [],
        thumbnailUrls: thumbnailUrls.length > 0 ? thumbnailUrls : undefined,
        replyToId: replyTo?.id,
        chatType: userChatId ? 'PUBLIC' : normalizeChatType(chatType),
        mentionIds: mentionIds.length > 0 ? mentionIds : undefined,
      };

      console.log('[MessageInput] Sending message:', messageData);
      await chatApi.createMessage(messageData);

      if (saveDraftTimeoutRef.current) {
        clearTimeout(saveDraftTimeoutRef.current);
        saveDraftTimeoutRef.current = null;
      }

      if (finalContextId && user?.id) {
        try {
          await chatApi.deleteDraft(
            contextType,
            finalContextId,
            userChatId ? 'PUBLIC' : normalizeChatType(chatType)
          );
          
          window.dispatchEvent(new CustomEvent('draft-deleted', {
            detail: {
              chatContextType: contextType,
              contextId: finalContextId
            }
          }));
        } catch (error) {
          console.error('Failed to delete draft:', error);
        }
      }

      setMessage('');
      setMentionIds([]);
      setSelectedImages([]);
      hasLoadedDraftRef.current = false;
      onCancelReply?.();
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
    <div className="bg-white dark:bg-gray-800 p-4 overflow-visible">
      {isChannelNonOwner && (
        <div className="mb-3 px-3 py-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-sm text-yellow-800 dark:text-yellow-200">
          {t('chat.onlyOwnerCanPost', { defaultValue: 'Only the channel owner can post messages' })}
        </div>
      )}
      {replyTo && (
        <ReplyPreview
          replyTo={{
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
      
      <form onSubmit={handleSubmit} className="relative overflow-visible">
        <div className="relative overflow-visible">
          <div className="relative overflow-visible">
            <MentionInput
              value={message}
              onChange={handleMessageChange}
              placeholder={t('chat.messages.typeMessage')}
              disabled={isDisabledForChannel || isLoading}
              game={game}
              bug={bug}
              groupChannel={groupChannel}
              userChatId={userChatId}
              contextType={contextType}
              chatType={chatType}
              onKeyDown={handleKeyDown}
              className="w-full"
              style={{
                minHeight: '48px',
                maxHeight: '120px',
              }}
            />
            
            <div className="absolute bottom-1 right-1.5 flex items-center gap-1 z-10">
              <button
                type="button"
                onClick={handleImageButtonClick}
                disabled={isDisabledForChannel || isLoading}
                className="w-8 h-8 bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-full flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Image size={16} />
              </button>
              
              <button
                type="submit"
                disabled={(!message.trim() && selectedImages.length === 0) || isLoading || isDisabledForChannel}
                className="w-10 h-10 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-full flex items-center justify-center hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl"
                aria-label={isLoading ? t('common.sending') : t('chat.messages.sendMessage')}
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
