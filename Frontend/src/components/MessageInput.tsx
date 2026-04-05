import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Capacitor } from '@capacitor/core';
import {
  chatApi,
  CreateMessageRequest,
  ChatMessage,
  ChatContextType,
  GroupChannel,
  OptimisticMessagePayload,
} from '@/api/chat';
import { ChatType, Game, Bug } from '@/types';
import { normalizeChatType } from '@/utils/chatType';
import { isGroupChannelAdminOrOwner } from '@/utils/gameResults';
import { ReplyPreview } from './ReplyPreview';
import { EditPreview } from './EditPreview';
import { MentionInput } from './MentionInput';
import { JoinGroupChannelButton } from './JoinGroupChannelButton';
import { PollCreationModal } from './chat/PollCreationModal';
import { TranslationLanguageModal } from './chat/TranslationLanguageModal';
import { TranslateToButton } from './chat/TranslateToButton';
import { UndoTranslateButton } from './chat/UndoTranslateButton';
import { useAuthStore } from '@/store/authStore';
import { PollType } from '@/api/chat';
import { draftStorage } from '@/services/draftStorage';
import { VoiceRecordingOverlay } from './audio/VoiceRecordingOverlay';
import { VoiceRecordButton } from './audio/VoiceRecordButton';
import { useAudioRecorder } from './audio/useAudioRecorder';
import { isValidImage } from '@/components/chat/messageInputDraftUtils';
import { MessageInputImagePreviewStrip } from '@/components/chat/MessageInputImagePreviewStrip';
import { MessageInputAttachMenu } from '@/components/chat/MessageInputAttachMenu';
import { useMessageInputDraftSync } from '@/components/chat/useMessageInputDraftSync';
import { useMessageInputMultiline } from '@/components/chat/useMessageInputMultiline';
import { useMessageInputTranslation } from '@/components/chat/useMessageInputTranslation';
import { useMessageInputVoiceSend } from '@/components/chat/useMessageInputVoiceSend';
import { useMessageInputSubmit, type SendQueuedParams } from '@/components/chat/useMessageInputSubmit';
import { uploadChatImageSlotWithRetry } from '@/components/chat/messageInputImageUpload';

export type { SendQueuedParams };

interface MessageInputProps {
  gameId?: string;
  bugId?: string;
  userChatId?: string;
  groupChannelId?: string;
  game?: Game | null;
  bug?: Bug | null;
  groupChannel?: GroupChannel | null;
  onMessageSent?: () => void;
  onOptimisticMessage?: (payload: OptimisticMessagePayload, pendingImageBlobs?: Blob[], pendingVoiceBlob?: Blob) => string;
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
  editingMessage?: ChatMessage | null;
  onCancelEdit?: () => void;
  onEditMessage?: (updated: ChatMessage) => void;
  lastOwnMessage?: ChatMessage | null;
  onStartEditMessage?: (message: ChatMessage) => void;
  translateToLanguage?: string | null;
  onTranslateToLanguageChange?: (translateToLanguage: string | null) => void | Promise<void>;
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
  editingMessage = null,
  onCancelEdit,
  onEditMessage,
  lastOwnMessage = null,
  onStartEditMessage,
  translateToLanguage: translateToLanguageProp = null,
  onTranslateToLanguageChange,
}) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const translateToLanguage = translateToLanguageProp ?? null;

  const contextType: ChatContextType = gameId ? 'GAME' : bugId ? 'BUG' : groupChannelId ? 'GROUP' : 'USER';
  const finalContextId = gameId || bugId || userChatId || groupChannelId;
  const resolvedChatType = userChatId ? 'PUBLIC' : normalizeChatType(chatType);

  const isChannel = groupChannel?.isChannel ?? false;
  const isGroup = groupChannel && !isChannel;
  const isChannelAdminOrOwner =
    isChannel && user && groupChannel ? isGroupChannelAdminOrOwner(groupChannel, user.id) : false;
  const isChannelParticipant = groupChannel?.isParticipant ?? false;
  const canWrite = isChannel ? isChannelAdminOrOwner : isGroup ? isChannelParticipant : true;
  const shouldShowJoinButton = isChannel && !isChannelAdminOrOwner && !isChannelParticipant;
  const isDisabled = !canWrite || disabled;

  const [message, setMessage] = useState('');
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imageUploadFailedSlots, setImageUploadFailedSlots] = useState<Set<number>>(() => new Set());
  const [retryingImageSlot, setRetryingImageSlot] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isPollModalOpen, setIsPollModalOpen] = useState(false);
  const voiceRecorder = useAudioRecorder();
  const lastAppliedEditIdRef = useRef<string | null>(null);
  const queueSendRef = useRef(false);

  const messageRef = useRef(message);
  const mentionIdsRef = useRef(mentionIds);
  const editingMessageRef = useRef(editingMessage);

  useEffect(() => {
    messageRef.current = message;
    mentionIdsRef.current = mentionIds;
    editingMessageRef.current = editingMessage;
  }, [message, mentionIds, editingMessage]);

  const { inputContainerRef, updateMultilineState } = useMessageInputMultiline(message, selectedImages.length);

  const translation = useMessageInputTranslation({
    message,
    mentionIds,
    setMessage,
    setMentionIds,
    translateToLanguage,
    onTranslateToLanguageChange,
    updateMultilineState,
    t,
  });

  const { debouncedSaveDraft, saveDraftTimeoutRef, hasLoadedDraftRef } = useMessageInputDraftSync({
    finalContextId,
    userId: user?.id,
    contextType,
    resolvedChatType,
    chatType,
    userChatId,
    messageRef,
    mentionIdsRef,
    editingMessageRef,
    setMessage,
    setMentionIds,
    setOriginalMessageBeforeTranslate: translation.setOriginalMessageBeforeTranslate,
    setOriginalMentionIdsBeforeTranslate: translation.setOriginalMentionIdsBeforeTranslate,
    updateMultilineState,
  });

  const inputBlocked = isLoading && !queueSendRef.current;

  const voice = useMessageInputVoiceSend({
    voiceRecorder,
    isDisabled,
    inputBlocked,
    finalContextId,
    contextType,
    userChatId,
    chatType,
    replyTo,
    propContextType,
    propContextId,
    userId: user?.id,
    onOptimisticMessage,
    onSendQueued,
    onMessageSent,
    onCancelReply,
    onMessageCreated,
    onSendFailed,
    t,
  });

  const { handleSubmit } = useMessageInputSubmit({
    gameId,
    bugId,
    userChatId,
    groupChannelId,
    contextType,
    finalContextId,
    propContextType,
    propContextId,
    chatType,
    message,
    setMessage,
    mentionIds,
    setMentionIds,
    selectedImages,
    setSelectedImages,
    editingMessage,
    onEditMessage,
    onCancelEdit,
    replyTo,
    onCancelReply,
    onMessageSent,
    onOptimisticMessage,
    onSendQueued,
    onSendFailed,
    onMessageCreated,
    isDisabled,
    inputBlocked,
    voiceMode: voice.voiceMode,
    saveDraftTimeoutRef,
    userId: user?.id,
    updateMultilineState,
    inputContainerRef,
    hasLoadedDraftRef,
    clearTranslationOriginals: translation.clearTranslationOriginals,
    setIsLoading,
    t,
    queueSendRef,
    onImageBatchUploadFailed: (failedIndices, files) => {
      setSelectedImages(files);
      setImageUploadFailedSlots(new Set(failedIndices));
    },
    onClearImageUploadFailures: () => setImageUploadFailedSlots(new Set()),
  });

  const imagePreviewUrls = useMemo(() => selectedImages.map((file) => URL.createObjectURL(file)), [selectedImages]);

  useEffect(() => {
    return () => {
      imagePreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [imagePreviewUrls]);

  const showMic =
    !message.trim() &&
    selectedImages.length === 0 &&
    !editingMessage &&
    resolvedChatType !== 'PHOTOS' &&
    !isDisabled;

  useEffect(() => {
    const currentId = editingMessage?.id ?? null;
    if (editingMessage && lastAppliedEditIdRef.current !== currentId) {
      lastAppliedEditIdRef.current = currentId;
      setMessage(editingMessage.content ?? '');
      setMentionIds(editingMessage.mentionIds ?? []);
      updateMultilineState();
    }
    if (!editingMessage) {
      if (lastAppliedEditIdRef.current !== null) {
        setMessage('');
        setMentionIds([]);
      }
      lastAppliedEditIdRef.current = null;
    }
  }, [editingMessage, updateMultilineState]);

  const handleMessageChange = (newValue: string, newMentionIds: string[]) => {
    setMessage(newValue);
    setMentionIds(newMentionIds);
    translation.clearTranslationOriginals();
    if (!editingMessage) debouncedSaveDraft(newValue, newMentionIds);
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
        chatType: userChatId ? 'PUBLIC' : normalizeChatType(chatType),
        content: pollData.question,
        poll: pollData,
      };
      const created = await chatApi.createMessage(messageData);
      onMessageSent?.();
      onMessageCreated?.('temp-' + Date.now(), created);
      if (user?.id) {
        const resolvedType = userChatId ? 'PUBLIC' : normalizeChatType(chatType);
        await draftStorage.remove(user.id, contextType, finalContextId, resolvedType);
        try {
          await chatApi.deleteDraft(contextType, finalContextId, resolvedType);
          window.dispatchEvent(
            new CustomEvent('draft-deleted', {
              detail: { chatContextType: contextType, contextId: finalContextId, chatType: resolvedType },
            })
          );
        } catch (err) {
          console.error('Failed to delete draft after poll:', err);
        }
      }
    } catch (error) {
      console.error('Failed to create poll:', error);
      toast.error(t('chat.sendFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (isDisabled || inputBlocked) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file && isValidImage(file)) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        setSelectedImages((prev) => [...prev, ...imageFiles]);
      }
    },
    [isDisabled, inputBlocked]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (isDisabled || inputBlocked) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer.types.includes('Files')) setIsDragOver(true);
    },
    [isDisabled, inputBlocked]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const { clientX: x, clientY: y } = e;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
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
      setSelectedImages((prev) => [...prev, ...imageFiles]);
    },
    [isDisabled, inputBlocked, t]
  );

  const removeImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
    setImageUploadFailedSlots((prev) => {
      const n = new Set<number>();
      for (const j of prev) {
        if (j < index) n.add(j);
        else if (j > index) n.add(j - 1);
      }
      return n;
    });
  };

  const handleRetryImageSlot = useCallback(
    async (index: number) => {
      const file = selectedImages[index];
      const targetId = gameId || bugId || userChatId || groupChannelId;
      if (!file || !targetId) return;
      setRetryingImageSlot(index);
      try {
        await uploadChatImageSlotWithRetry(file, targetId, contextType);
        setImageUploadFailedSlots((prev) => {
          const n = new Set(prev);
          n.delete(index);
          return n;
        });
        toast.success(
          t('chat.imageSlotRetryOk', { defaultValue: 'Photo uploaded — send when all attachments are ready.' })
        );
      } catch {
        toast.error(t('chat.imageSlotRetryFail', { defaultValue: 'Could not upload this photo.' }));
      } finally {
        setRetryingImageSlot(null);
      }
    },
    [selectedImages, gameId, bugId, userChatId, groupChannelId, contextType, t]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const platform = Capacitor.getPlatform();
    const isMobile = platform === 'ios' || platform === 'android';
    if (e.key === 'Enter' && !e.shiftKey && !isMobile) {
      e.preventDefault();
      void handleSubmit(e as unknown as React.FormEvent);
      return;
    }
    if (
      e.key === 'ArrowUp' &&
      !isMobile &&
      !message.trim() &&
      !replyTo &&
      !editingMessage &&
      lastOwnMessage &&
      onStartEditMessage
    ) {
      e.preventDefault();
      onStartEditMessage(lastOwnMessage);
    }
  };

  const handleJoinChannel = async () => {
    if (!groupChannelId || !groupChannel) return;
    setIsLoading(true);
    try {
      await chatApi.joinGroupChannel(groupChannelId);
      if (onGroupChannelUpdate) await onGroupChannelUpdate();
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
          <JoinGroupChannelButton groupChannel={groupChannel} onJoin={handleJoinChannel} isLoading={isLoading} />
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 overflow-visible" onPaste={handlePaste} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      <div className="flex items-center justify-end gap-2 mb-1">
        {translation.originalMessageBeforeTranslate != null && (
          <UndoTranslateButton
            onClick={translation.handleUndoTranslate}
            disabled={isDisabled || inputBlocked || translation.isTranslating}
          />
        )}
        <TranslateToButton
          translateToLanguage={translateToLanguage}
          isTranslating={translation.isTranslating}
          disabled={isDisabled || inputBlocked}
          translateDisabled={!message.trim()}
          onOpenModal={() => translation.setTranslationModalOpen(true)}
          onTranslate={translation.handleTranslateButtonClick}
        />
      </div>
      <TranslationLanguageModal
        open={translation.translationModalOpen}
        onClose={() => translation.setTranslationModalOpen(false)}
        onSelect={translation.handleTranslateLanguageSelect}
        selectedLanguageCode={translateToLanguage}
        onRemoveLanguage={translation.handleRemoveTranslateLanguage}
      />
      {editingMessage && <EditPreview message={editingMessage} onCancel={onCancelEdit!} className="mb-3" />}
      {replyTo && !editingMessage && (
        <ReplyPreview
          replyTo={{
            id: replyTo.id,
            content: replyTo.content,
            messageType: replyTo.messageType,
            sender: replyTo.sender || { id: 'system', firstName: 'System' },
          }}
          onCancel={onCancelReply}
          onScrollToMessage={onScrollToMessage}
          className="mb-3"
        />
      )}
      <MessageInputImagePreviewStrip
        imagePreviewUrls={imagePreviewUrls}
        onRemove={removeImage}
        failedSlotIndices={imageUploadFailedSlots}
        retryingSlotIndex={retryingImageSlot}
        onRetrySlot={handleRetryImageSlot}
      />
      <form onSubmit={handleSubmit} className="relative overflow-visible">
        <div className="flex items-end gap-2">
          <MessageInputAttachMenu
            isDisabled={isDisabled}
            inputBlocked={inputBlocked}
            voiceMode={voice.voiceMode}
            onAddImages={(files) => setSelectedImages((prev) => [...prev, ...files])}
            onOpenPoll={() => setIsPollModalOpen(true)}
          />
          <div
            className={`flex-1 min-w-0 message-input-panel relative overflow-visible !bg-transparent rounded-[24px] shadow-[0_8px_32px_rgba(0,0,0,0.16),0_16px_64px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.5),0_16px_64px_rgba(0,0,0,0.4)] transition-all ${
              isDragOver ? 'border-2 border-blue-400 dark:border-blue-500 border-dashed' : 'border border-gray-200 dark:border-gray-700'
            }`}
          >
            <div ref={inputContainerRef} className="relative overflow-visible min-w-0 w-full max-w-full">
              {voice.voiceMode ? (
                <VoiceRecordingOverlay
                  durationMs={voiceRecorder.durationMs}
                  liveLevels={voiceRecorder.liveLevels}
                  busy={voice.voiceBusy}
                  onCancel={voice.handleVoiceCancel}
                  onConfirm={voice.handleVoiceConfirm}
                />
              ) : (
                <>
                  <div className="rounded-[24px] bg-white dark:bg-gray-800">
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
                      style={{ minHeight: '48px', maxHeight: '120px', paddingLeft: '20px' }}
                    />
                  </div>
                  {showMic ? (
                    <VoiceRecordButton
                      onClick={() => void voice.handleStartVoice()}
                      disabled={inputBlocked || isDisabled}
                      title={t('chat.voice.record', { defaultValue: 'Record voice' })}
                      aria-label={t('chat.voice.record', { defaultValue: 'Record voice message' })}
                    />
                  ) : (
                    <button
                      type="submit"
                      disabled={(!message.trim() && selectedImages.length === 0) || inputBlocked || isDisabled}
                      className="absolute bottom-0.5 right-[2px] w-11 h-11 bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 text-white rounded-full flex items-center justify-center hover:from-blue-600 hover:via-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-[0_4px_24px_rgba(59,130,246,0.6),0_8px_48px_rgba(59,130,246,0.4)] hover:shadow-[0_6px_32px_rgba(59,130,246,0.7),0_12px_56px_rgba(59,130,246,0.5)] hover:scale-105 z-10"
                      aria-label={inputBlocked ? t('common.sending') : t('chat.messages.sendMessage')}
                    >
                      {inputBlocked ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                      )}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </form>
      <PollCreationModal isOpen={isPollModalOpen} onClose={() => setIsPollModalOpen(false)} onSubmit={handlePollCreate} />
    </div>
  );
};
