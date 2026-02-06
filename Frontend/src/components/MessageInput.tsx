import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { chatApi, CreateMessageRequest, ChatMessage, ChatContextType, GroupChannel, OptimisticMessagePayload } from '@/api/chat';
import { mediaApi } from '@/api/media';
import { ChatType, Game, Bug } from '@/types';
import { normalizeChatType } from '@/utils/chatType';
import { isGroupChannelAdminOrOwner } from '@/utils/gameResults';
import { ReplyPreview } from './ReplyPreview';
import { MentionInput } from './MentionInput';
import { JoinGroupChannelButton } from './JoinGroupChannelButton';
import { PollCreationModal } from './chat/PollCreationModal';
import { X, ListPlus, Paperclip, Image } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { pickImages } from '@/utils/photoCapture';
import { isCapacitor } from '@/utils/capacitor';
import { PollType } from '@/api/chat';

const isValidImage = (file: File): boolean => {
  return file.type.startsWith('image/') && file.size <= 10 * 1024 * 1024;
};

const draftLoadingCache = new Map<string, Promise<any>>();
const loadedDraftsCache = new Set<string>();

export interface SendQueuedParams {
  tempId: string;
  contextType: ChatContextType;
  contextId: string;
  payload: OptimisticMessagePayload;
  mediaUrls?: string[];
  thumbnailUrls?: string[];
}

interface MessageInputProps {
  gameId?: string;
  bugId?: string;
  userChatId?: string;
  groupChannelId?: string;
  game?: Game | null;
  bug?: Bug | null;
  groupChannel?: GroupChannel | null;
  onMessageSent?: () => void;
  onOptimisticMessage?: (payload: OptimisticMessagePayload) => string;
  onSendQueued?: (params: SendQueuedParams) => void;
  onSendFailed?: (optimisticId: string) => void;
  onMessageCreated?: (optimisticId: string, serverMessage: ChatMessage) => void;
  disabled?: boolean;
  replyTo?: ChatMessage | null;
  onCancelReply?: () => void;
  onScrollToMessage?: (messageId: string) => void;
  chatType?: ChatType;
  onGroupChannelUpdate?: () => void | Promise<void>;
  contextType?: ChatContextType;
  contextId?: string;
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
  onOptimisticMessage,
  onSendQueued,
  onSendFailed,
  onMessageCreated,
  disabled = false,
  replyTo,
  onCancelReply,
  onScrollToMessage,
  chatType = 'PUBLIC',
  onGroupChannelUpdate,
  contextType: propContextType,
  contextId: propContextId,
}) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [message, setMessage] = useState('');
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [, setIsMultiline] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPollModalOpen, setIsPollModalOpen] = useState(false);
  const [isAttachExpanded, setIsAttachExpanded] = useState(false);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const saveDraftTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasLoadedDraftRef = useRef(false);
  const loadingDraftKeyRef = useRef<string | null>(null);
  const queueSendRef = useRef(false);

  const contextType: ChatContextType = gameId ? 'GAME' : bugId ? 'BUG' : groupChannelId ? 'GROUP' : 'USER';
  const finalContextId = gameId || bugId || userChatId || groupChannelId;

  const isChannel = groupChannel?.isChannel ?? false;
  const isGroup = groupChannel && !isChannel;
  const isChannelAdminOrOwner = isChannel && user && groupChannel ? isGroupChannelAdminOrOwner(groupChannel, user.id) : false;
  const isChannelParticipant = groupChannel?.isParticipant ?? false;
  const canWrite = isChannel ? isChannelAdminOrOwner : (isGroup ? isChannelParticipant : true);
  const shouldShowJoinButton = isChannel && !isChannelAdminOrOwner && !isChannelParticipant;
  const isDisabled = (!canWrite) || disabled;
  const inputBlocked = isLoading && !queueSendRef.current;

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

  const updateMultilineState = useCallback(() => {
    requestAnimationFrame(() => {
      if (inputContainerRef.current) {
        const textarea = inputContainerRef.current.querySelector('textarea');
        if (textarea) {
          const computedStyle = window.getComputedStyle(textarea);
          const lineHeight = parseFloat(computedStyle.lineHeight);

          if (lineHeight && lineHeight > 0) {
            const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
            const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
            const scrollHeight = textarea.scrollHeight;
            const contentHeight = scrollHeight - paddingTop - paddingBottom;
            const rowCount = Math.ceil(contentHeight / lineHeight);
            setIsMultiline(rowCount > 2);
          } else {
            const fontSize = parseFloat(computedStyle.fontSize) || 14;
            const estimatedLineHeight = fontSize * 1.5;
            const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
            const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
            const scrollHeight = textarea.scrollHeight;
            const contentHeight = scrollHeight - paddingTop - paddingBottom;
            const rowCount = Math.ceil(contentHeight / estimatedLineHeight);
            setIsMultiline(rowCount > 2);
          }
        }
      }
    });
  }, []);

  const messageRef = useRef(message);
  const mentionIdsRef = useRef(mentionIds);

  useEffect(() => {
    messageRef.current = message;
    mentionIdsRef.current = mentionIds;
  }, [message, mentionIds]);

  const loadDraft = useCallback(async () => {
    if (!finalContextId || !user?.id) return;

    const draftKey = `${contextType}-${finalContextId}-${userChatId ? 'PUBLIC' : normalizeChatType(chatType)}`;

    if (loadedDraftsCache.has(draftKey)) {
      const cachedPromise = draftLoadingCache.get(draftKey);
      if (cachedPromise) {
        try {
          const draft = await cachedPromise;
          if (draft) {
            const hasUserTyped = messageRef.current.trim().length > 0 || mentionIdsRef.current.length > 0;
            if (!hasUserTyped) {
              setMessage(draft.content || '');
              setMentionIds(draft.mentionIds || []);
              setTimeout(() => updateMultilineState(), 100);
            }
          }
        } catch (error) {
          console.error('Failed to load draft from cache:', error);
        }
      }
      return;
    }

    if (draftLoadingCache.has(draftKey)) {
      const existingPromise = draftLoadingCache.get(draftKey);
      if (existingPromise) {
        try {
          const draft = await existingPromise;
          if (draft) {
            const hasUserTyped = messageRef.current.trim().length > 0 || mentionIdsRef.current.length > 0;
            if (!hasUserTyped) {
              setMessage(draft.content || '');
              setMentionIds(draft.mentionIds || []);
              setTimeout(() => updateMultilineState(), 100);
            }
          }
        } catch (error) {
          console.error('Failed to load draft:', error);
        }
      }
      return;
    }

    loadingDraftKeyRef.current = draftKey;
    hasLoadedDraftRef.current = true;

    if (saveDraftTimeoutRef.current) {
      clearTimeout(saveDraftTimeoutRef.current);
      saveDraftTimeoutRef.current = null;
    }

    const draftPromise = chatApi.getDraft(
      contextType,
      finalContextId,
      userChatId ? 'PUBLIC' : normalizeChatType(chatType)
    ).then(draft => {
      loadedDraftsCache.add(draftKey);
      setTimeout(() => {
        draftLoadingCache.delete(draftKey);
        loadedDraftsCache.delete(draftKey);
      }, 5000);
      return draft;
    }).catch(error => {
      draftLoadingCache.delete(draftKey);
      throw error;
    });

    draftLoadingCache.set(draftKey, draftPromise);

    try {
      const draft = await draftPromise;
      if (draft) {
        const hasUserTyped = messageRef.current.trim().length > 0 || mentionIdsRef.current.length > 0;
        if (!hasUserTyped) {
          setMessage(draft.content || '');
          setMentionIds(draft.mentionIds || []);
          setTimeout(() => updateMultilineState(), 100);
        }
      }
    } catch (error) {
      console.error('Failed to load draft:', error);
    }
  }, [finalContextId, user?.id, contextType, chatType, userChatId, updateMultilineState]);

  useEffect(() => {
    if (saveDraftTimeoutRef.current) {
      clearTimeout(saveDraftTimeoutRef.current);
      saveDraftTimeoutRef.current = null;
    }
    const draftKey = `${contextType}-${finalContextId}-${userChatId ? 'PUBLIC' : normalizeChatType(chatType)}`;
    if (loadingDraftKeyRef.current !== draftKey) {
      hasLoadedDraftRef.current = false;
      loadedDraftsCache.delete(draftKey);
    }
    setMessage('');
    setMentionIds([]);
    loadDraft();
  }, [finalContextId, contextType, chatType, loadDraft, userChatId]);

  useEffect(() => {
    updateMultilineState();
  }, [message, selectedImages, updateMultilineState]);

  useEffect(() => {
    if (!inputContainerRef.current) return;

    const textarea = inputContainerRef.current.querySelector('textarea');
    if (!textarea) return;

    const resizeObserver = new ResizeObserver(() => {
      updateMultilineState();
    });

    resizeObserver.observe(textarea);

    return () => {
      resizeObserver.disconnect();
    };
  }, [updateMultilineState]);

  useEffect(() => {
    const handleDraftUpdated = (event: CustomEvent) => {
      const { chatContextType, contextId } = event.detail;
      const draftKey = `${chatContextType}-${contextId}-${userChatId ? 'PUBLIC' : normalizeChatType(chatType)}`;
      loadedDraftsCache.delete(draftKey);
      draftLoadingCache.delete(draftKey);
    };

    const handleDraftDeleted = (event: CustomEvent) => {
      const { chatContextType, contextId } = event.detail;
      const draftKey = `${chatContextType}-${contextId}-${userChatId ? 'PUBLIC' : normalizeChatType(chatType)}`;
      loadedDraftsCache.delete(draftKey);
      draftLoadingCache.delete(draftKey);
    };

    window.addEventListener('draft-updated', handleDraftUpdated as EventListener);
    window.addEventListener('draft-deleted', handleDraftDeleted as EventListener);

    return () => {
      window.removeEventListener('draft-updated', handleDraftUpdated as EventListener);
      window.removeEventListener('draft-deleted', handleDraftDeleted as EventListener);
    };
  }, [contextType, finalContextId, chatType, userChatId]);

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

    setSelectedImages(prev => [...prev, ...imageFiles]);
  };

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    if (isDisabled || inputBlocked) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file && isValidImage(file)) {
          imageFiles.push(file);
        }
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault();
      setSelectedImages(prev => [...prev, ...imageFiles]);
    }
  }, [isDisabled, inputBlocked]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (isDisabled || inputBlocked) return;

    e.preventDefault();
    e.stopPropagation();

    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true);
    }
  }, [isDisabled, inputBlocked]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;

    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    if (isDisabled || inputBlocked) return;

    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    const imageFiles = Array.from(files).filter(isValidImage);

    if (imageFiles.length === 0) {
      toast.error(t('chat.invalidImageType'));
      return;
    }

    setSelectedImages(prev => [...prev, ...imageFiles]);
  }, [isDisabled, inputBlocked, t]);

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
    setIsAttachExpanded(false);
  };

  const handlePollButtonClick = () => {
    if (isDisabled || inputBlocked) return;
    setIsPollModalOpen(true);
    setIsAttachExpanded(false);
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
    updateMultilineState();
  };

  const handlePollCreate = async (pollData: {
    question: string;
    options: string[];
    type: PollType;
    isAnonymous: boolean;
    allowsMultipleAnswers: boolean;
    quizCorrectOptionIndex?: number;
  }) => {
    if (inputBlocked || isDisabled) return;

    if (!finalContextId) {
      toast.error(t('chat.missingContextId'));
      return;
    }

    setIsLoading(true);
    try {
      const messageData: CreateMessageRequest = {
        chatContextType: gameId ? 'GAME' : bugId ? 'BUG' : groupChannelId ? 'GROUP' : 'USER',
        contextId: finalContextId,
        gameId: gameId,
        chatType: userChatId ? 'PUBLIC' : normalizeChatType(chatType),
        content: pollData.question,
        poll: pollData
      };

      const created = await chatApi.createMessage(messageData);

      onMessageSent?.();
      onMessageCreated?.('temp-' + Date.now(), created); // Optimistic ID is tricky here without proper handling, but we just need to refresh list

    } catch (error) {
      console.error('Failed to create poll:', error);
      toast.error(t('chat.sendFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!message.trim() && selectedImages.length === 0) || inputBlocked || isDisabled) return;

    if (!finalContextId) {
      console.error('[MessageInput] Missing contextId:', { gameId, bugId, userChatId, groupChannelId });
      toast.error(t('chat.missingContextId') || 'Missing chat context');
      return;
    }

    const trimmedContent = message.trim();
    const useOptimistic = !!onOptimisticMessage;
    let optimisticId: string | undefined;

    const payload: OptimisticMessagePayload = {
      content: trimmedContent,
      mediaUrls: [],
      thumbnailUrls: [],
      replyToId: replyTo?.id,
      replyTo: replyTo ? { id: replyTo.id, content: replyTo.content, sender: replyTo.sender || { id: 'system', firstName: 'System' } } : undefined,
      chatType: userChatId ? 'PUBLIC' : normalizeChatType(chatType),
      mentionIds: [...mentionIds],
    };

    const useQueue = useOptimistic && !!onSendQueued && (propContextType != null) && (propContextId != null);
    if (useQueue) queueSendRef.current = true;

    if (useOptimistic) {
      optimisticId = onOptimisticMessage(payload);
      if (optimisticId) {
        onMessageSent?.();
        setMessage('');
        setMentionIds([]);
        setSelectedImages([]);
        hasLoadedDraftRef.current = false;
        setTimeout(() => updateMultilineState(), 100);
        onCancelReply?.();
        requestAnimationFrame(() => {
          (inputContainerRef.current?.querySelector('textarea') as HTMLTextAreaElement | null)?.focus();
        });
      }
    } else {
      setIsLoading(true);
      onMessageSent?.();
    }

    queueMicrotask(() => {
      (async () => {
        try {
          const { originalUrls, thumbnailUrls } = await uploadImages();
          if (useQueue && optimisticId) {
            onSendQueued!({
              tempId: optimisticId,
              contextType: propContextType!,
              contextId: propContextId!,
              payload: { ...payload, mediaUrls: originalUrls, thumbnailUrls },
              mediaUrls: originalUrls.length > 0 ? originalUrls : undefined,
              thumbnailUrls: thumbnailUrls.length > 0 ? thumbnailUrls : undefined,
            });
          } else {
            const messageData: CreateMessageRequest = {
              chatContextType: gameId ? 'GAME' : bugId ? 'BUG' : groupChannelId ? 'GROUP' : 'USER',
              contextId: finalContextId,
              gameId: gameId,
              content: trimmedContent || undefined,
              mediaUrls: originalUrls.length > 0 ? originalUrls : [],
              thumbnailUrls: thumbnailUrls.length > 0 ? thumbnailUrls : undefined,
              replyToId: replyTo?.id,
              chatType: userChatId ? 'PUBLIC' : normalizeChatType(chatType),
              mentionIds: mentionIds.length > 0 ? mentionIds : undefined,
            };
            const created = await chatApi.createMessage(messageData);
            if (useOptimistic && optimisticId && onMessageCreated) {
              onMessageCreated(optimisticId, created);
            }
          }
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
                detail: { chatContextType: contextType, contextId: finalContextId }
              }));
            } catch (err) {
              console.error('Failed to delete draft:', err);
            }
          }
          if (!useOptimistic) {
            setMessage('');
            setMentionIds([]);
            setSelectedImages([]);
            hasLoadedDraftRef.current = false;
            setTimeout(() => updateMultilineState(), 100);
            onCancelReply?.();
          }
        } catch (error) {
          console.error('Failed to send message:', error);
          if (optimisticId && onSendFailed) onSendFailed(optimisticId);
          else if (!useOptimistic) setMessage(trimmedContent);
          toast.error(t('chat.sendFailed') || 'Failed to send message');
        } finally {
          if (useQueue) queueSendRef.current = false;
          if (!useQueue) setIsLoading(false);
          requestAnimationFrame(() => {
            (inputContainerRef.current?.querySelector('textarea') as HTMLTextAreaElement | null)?.focus();
          });
        }
      })();
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleJoinChannel = async () => {
    if (!groupChannelId || !groupChannel) return;
    setIsLoading(true);
    try {
      await chatApi.joinGroupChannel(groupChannelId);
      if (onGroupChannelUpdate) {
        await onGroupChannelUpdate();
      }
      onMessageSent?.();
    } catch (error) {
      console.error('Failed to join channel:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (shouldShowJoinButton && groupChannel) {
    return (
      <div className="p-3 overflow-visible">
        <div className="flex items-center justify-center">
          <JoinGroupChannelButton
            groupChannel={groupChannel}
            onJoin={handleJoinChannel}
            isLoading={isLoading}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="p-3 overflow-visible"
      onPaste={handlePaste}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
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
        <div className="mb-3 flex gap-2 overflow-x-auto overflow-y-visible pb-1">
          {imagePreviewUrls.map((url, index) => (
            <div key={index} className="relative flex-shrink-0 pt-1 pr-1">
              <img
                src={url}
                alt={`Preview ${index + 1}`}
                className="w-16 h-16 object-cover rounded-lg border border-gray-200 dark:border-gray-600"
              />
              <button
                onClick={() => removeImage(index)}
                className="absolute top-0 right-0 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-sm z-10"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="relative overflow-visible">
        <div className="flex items-end gap-2">
          <div ref={attachMenuRef} className="flex flex-col-reverse items-center gap-2 flex-shrink-0 bg-transparent">
            <button
              type="button"
              onClick={() => setIsAttachExpanded(prev => !prev)}
              disabled={isDisabled || inputBlocked}
              className="w-11 h-11 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
              title={t('chat.attach', 'Attach')}
            >
              <Paperclip size={20} className="text-gray-700 dark:text-gray-300" />
            </button>
            <div
              className={`flex flex-col-reverse items-center gap-2 transition-all duration-300 ease-out bg-transparent ${
                isAttachExpanded ? 'max-h-28 opacity-100 overflow-visible' : 'max-h-0 opacity-0 pointer-events-none overflow-hidden'
              }`}
            >
              <button
                type="button"
                onClick={handleImageButtonClick}
                disabled={isDisabled || inputBlocked}
                className="w-11 h-11 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-300 shadow-[0_4px_12px_rgba(0,0,0,0.15),0_8px_24px_rgba(0,0,0,0.12),0_16px_48px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.3),0_8px_24px_rgba(0,0,0,0.25),0_16px_48px_rgba(0,0,0,0.2)] hover:scale-105"
                title={t('chat.attachImages', 'Images')}
              >
                <Image size={20} className="text-gray-700 dark:text-gray-300" />
              </button>
              <button
                type="button"
                onClick={handlePollButtonClick}
                disabled={isDisabled || inputBlocked}
                className="w-11 h-11 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-300 shadow-[0_4px_12px_rgba(0,0,0,0.15),0_8px_24px_rgba(0,0,0,0.12),0_16px_48px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.3),0_8px_24px_rgba(0,0,0,0.25),0_16px_48px_rgba(0,0,0,0.2)] hover:scale-105"
                title={t('chat.poll.createTitle', 'Create Poll')}
              >
                <ListPlus size={20} className="text-gray-700 dark:text-gray-300" />
              </button>
            </div>
          </div>
          <div className={`flex-1 message-input-panel relative overflow-visible !bg-transparent md:!bg-white md:dark:!bg-gray-800 rounded-[24px] shadow-[0_8px_32px_rgba(0,0,0,0.16),0_16px_64px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.5),0_16px_64px_rgba(0,0,0,0.4)] transition-all ${isDragOver ? 'border-2 border-blue-400 dark:border-blue-500 border-dashed' : 'border border-gray-200 dark:border-gray-700'
          }`}>
          <div ref={inputContainerRef} className="relative overflow-visible">
            <div className="rounded-2xl bg-white dark:bg-gray-800 md:bg-transparent">
              <MentionInput
              value={message}
              onChange={handleMessageChange}
              placeholder={t('chat.messages.typeMessage')}
              disabled={isDisabled || inputBlocked}
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
                paddingLeft: '20px',
              }}
              />
            </div>
            <button
              type="submit"
              disabled={(!message.trim() && selectedImages.length === 0) || inputBlocked || isDisabled}
              className="absolute bottom-0.5 right-1 w-11 h-11 bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 text-white rounded-full flex items-center justify-center hover:from-blue-600 hover:via-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-[0_4px_24px_rgba(59,130,246,0.6),0_8px_48px_rgba(59,130,246,0.4)] hover:shadow-[0_6px_32px_rgba(59,130,246,0.7),0_12px_56px_rgba(59,130,246,0.5)] hover:scale-105 z-10"
              aria-label={inputBlocked ? t('common.sending') : t('chat.messages.sendMessage')}
            >
              {inputBlocked ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg
                  className="w-5 h-5"
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
      <PollCreationModal
        isOpen={isPollModalOpen}
        onClose={() => setIsPollModalOpen(false)}
        onSubmit={handlePollCreate}
      />
    </div>
  );
};
