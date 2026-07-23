import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Capacitor } from '@capacitor/core';
import {
  chatApi,
  CreateMessageRequest,
} from '@/api/chat';
import { X } from 'lucide-react';
import { normalizeChatType } from '@/utils/chatType';
import { isGroupChannelAdminOrOwner } from '@/utils/gameResults';
import { isUserGroupChannelParticipant } from '@/utils/groupChannelParticipation';
import { MentionInput } from './MentionInput';
import { MessageInputComposerContextStrip } from '@/components/chat/MessageInputComposerContextStrip';
import { JoinGroupChannelButton } from './JoinGroupChannelButton';
import { PollCreationModal } from './chat/PollCreationModal';
import {
  TranslationLanguageModal,
} from './chat/TranslationLanguageModal';
import { TranslateToButton } from './chat/TranslateToButton';
import { UndoTranslateButton } from './chat/UndoTranslateButton';
import { useAuthStore } from '@/store/authStore';
import { usersApi } from '@/api/users';
import {
  resolveAppLanguageTranslationTargetCode,
} from '@/utils/translationLanguages';
import { runWithProfileName } from '@/utils/runWithProfileName';
import { PollType } from '@/api/chat';
import { deleteDraftFromComposer } from '@/components/chat/draftDeleteFlow';
import { VoiceRecordingOverlay } from './audio/VoiceRecordingOverlay';
import { VoiceRecordButton } from './audio/VoiceRecordButton';
import { useAudioRecorder } from './audio/useAudioRecorder';
import { isValidImage } from '@/components/chat/messageInputDraftUtils';
import { prefetchLinkPreview } from '@/components/MessageItem/linkPreview/useLinkPreview';
import { isEligibleLinkPreviewUrl } from '@/components/MessageItem/linkPreview/eligibility';
import { MessageInputImagePreviewStrip } from '@/components/chat/MessageInputImagePreviewStrip';
import { MessageInputAttachMenu } from '@/components/chat/MessageInputAttachMenu';
import { MessageInputSearchToggle } from '@/components/chat/MessageInputSearchToggle';
import { useMessageInputDraftSync } from '@/components/chat/useMessageInputDraftSync';
import { useMessageInputMultiline } from '@/components/chat/useMessageInputMultiline';
import { useMessageInputTranslation } from '@/components/chat/useMessageInputTranslation';
import { useMessageInputVoiceSend } from '@/components/chat/useMessageInputVoiceSend';
import { useMessageInputVideoSend } from '@/components/chat/useMessageInputVideoSend';
import { useMessageInputStickerSend } from '@/components/chat/useMessageInputStickerSend';
import { useMessageInputGiphySend } from '@/components/chat/useMessageInputGiphySend';
import { useMessageInputSubmit, type SendQueuedParams } from '@/components/chat/useMessageInputSubmit';
import { uploadChatImageSlotWithRetry } from '@/components/chat/messageInputImageUpload';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';
import { TypingIndicator } from '@/components/chat/TypingIndicator';
import { MessageInputScrollFab } from '@/components/chat/MessageInputScrollFab';
import { ChatStickerTray } from '@/components/chat/ChatStickerTray';
import { ChatStickerTrayButton } from '@/components/chat/ChatStickerTrayButton';
import { useThreadComposer, useThreadMessageActions } from '@/pages/GameChat/useThreadView';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { CHAT_PANEL_TRANSITION, COMPOSER_TOOLBAR_SPRING } from '@/components/chat/chatListMotion';
import { PANEL_ENTER_Y, PANEL_EXIT_Y } from '@/components/motion/motionTokens';
import { ComposerLinkPreview } from '@/components/chat/ComposerLinkPreview';
import { useComposerLinkPreview } from '@/components/chat/useComposerLinkPreview';

export type { SendQueuedParams };

export interface MessageInputProps {
  disabled?: boolean;
}

export const MessageInput: React.FC<MessageInputProps> = ({ disabled: disabledProp = false }) => {
  const composer = useThreadComposer();
  const actions = useThreadMessageActions();
  const {
    id,
    contextType,
    currentChatType,
    game,
    bug,
    groupChannel,
    userChat,
    handleMessageSent: onMessageSent,
    handleGroupChannelUpdate: onGroupChannelUpdate,
    replyTo,
    handleCancelReply: onCancelReply,
    editingMessage,
    handleCancelEdit: onCancelEdit,
    handleTranslateToLanguageChange: onTranslateToLanguageChange,
    translateToLanguageForChat,
    autoTranslateForModal: autoTranslate,
    lastOwnMessage,
  } = composer;
  const {
    handleAddOptimisticMessage: onOptimisticMessage,
    handleSendQueued: onSendQueued,
    handleSendFailed: onSendFailed,
    handleReplaceOptimisticWithServerMessage: onMessageCreated,
    handleEditMessage: onStartEditMessage,
    handleMessageUpdated: onEditMessage,
  } = actions;

  const gameId = contextType === 'GAME' ? id : undefined;
  const bugId = contextType === 'BUG' ? id : undefined;
  const userChatId = contextType === 'USER' ? id : undefined;
  const groupChannelId = contextType === 'GROUP' ? id : undefined;
  const chatType = currentChatType;
  const propContextType = contextType;
  const propContextId = id;
  const disabled = disabledProp;
  const translateToLanguage = translateToLanguageForChat ?? null;
  const userChatResolved = userChat ?? null;
  const { t } = useTranslation();
  const { user, updateUser } = useAuthStore();

  const finalContextId = gameId || bugId || userChatId || groupChannelId;
  const resolvedChatType = userChatId ? 'PUBLIC' : normalizeChatType(chatType);

  const isChannel = groupChannel?.isChannel ?? false;
  const isGroup = groupChannel && !isChannel;
  const isChannelAdminOrOwner =
    isChannel && user && groupChannel ? isGroupChannelAdminOrOwner(groupChannel, user.id) : false;
  const isChannelParticipant =
    groupChannel && user ? isUserGroupChannelParticipant(groupChannel, user.id) : false;
  const canWrite = isChannel ? isChannelAdminOrOwner : isGroup ? isChannelParticipant : true;
  const shouldShowJoinButton = isChannel && !isChannelAdminOrOwner && !isChannelParticipant;
  const isDisabled = !canWrite || disabled;

  const typingEnabled = !isDisabled && !!finalContextId && canWrite && !shouldShowJoinButton;
  const { typingUserIds, notifyKeystroke, stopTyping } = useTypingIndicator({
    contextType,
    contextId: finalContextId,
    enabled: typingEnabled,
  });

  const [message, setMessage] = useState('');
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imageUploadFailedSlots, setImageUploadFailedSlots] = useState<Set<number>>(() => new Set());
  const [retryingImageSlot, setRetryingImageSlot] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isPollModalOpen, setIsPollModalOpen] = useState(false);
  const [isStickerTrayOpen, setIsStickerTrayOpen] = useState(false);
  const [mediaTrayInitialTab, setMediaTrayInitialTab] = useState<'recent' | 'gifs'>('recent');
  const [isComposerSearchExpanded, setIsComposerSearchExpanded] = useState(false);
  const voiceRecorder = useAudioRecorder();
  const lastAppliedEditIdRef = useRef<string | null>(null);
  const queueSendRef = useRef(false);

  const messageRef = useRef(message);
  const mentionIdsRef = useRef(mentionIds);
  const editingMessageRef = useRef(editingMessage);
  // Keep refs current during render so chat-switch draft flush never reads a stale composer.
  messageRef.current = message;
  mentionIdsRef.current = mentionIds;
  editingMessageRef.current = editingMessage;

  useEffect(() => {
    return () => {
      setIsLoading(false);
      queueSendRef.current = false;
    };
  }, []);

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

  const appLanguageCode = resolveAppLanguageTranslationTargetCode(user);
  const preferredTranslationLanguage = user?.translateToLanguage ?? null;

  const handlePreferredTranslationLanguageChange = useCallback(
    async (languageCode: string | null) => {
      try {
        const response = await usersApi.updateProfile({ translateToLanguage: languageCode });
        if (response.data) {
          updateUser(response.data);
        }
      } catch (err) {
        console.error('Update preferred translation language failed:', err);
        toast.error(t('chat.sendFailed') || 'Failed to save');
      }
    },
    [updateUser, t]
  );

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
  const composerPreview = useComposerLinkPreview(
    editingMessage ? '' : message,
    `${contextType}:${finalContextId ?? 'none'}:${resolvedChatType}`
  );

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
    onStopTyping: stopTyping,
    t,
  });

  const video = useMessageInputVideoSend({
    isDisabled,
    inputBlocked,
    finalContextId,
    contextType,
    chatType,
    replyTo,
    onOptimisticMessage,
    onSendQueued,
    onMessageSent,
    onCancelReply,
    t,
  });

  const sticker = useMessageInputStickerSend({
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
    onSendFailed,
    onStopTyping: stopTyping,
    t,
  });

  const giphy = useMessageInputGiphySend({
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
    onSendFailed,
    onStopTyping: stopTyping,
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
    linkPreviewUrl: composerPreview.selectedUrl,
    linkPreviewDisabled: composerPreview.disabled,
    linkPreview: composerPreview.preview,
    linkPreviewToken: composerPreview.snapshotToken,
    onImageBatchUploadFailed: (failedIndices, files) => {
      setSelectedImages(files);
      setImageUploadFailedSlots(new Set(failedIndices));
    },
    onClearImageUploadFailures: () => setImageUploadFailedSlots(new Set()),
    onStopTyping: stopTyping,
  });

  const reduceMotion = usePrefersReducedMotion();
  const toolbarTransition = reduceMotion ? { duration: 0 } : COMPOSER_TOOLBAR_SPRING;

  const showMic =
    !message.trim() &&
    selectedImages.length === 0 &&
    !editingMessage &&
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
    if (newValue.trim()) notifyKeystroke();
    else stopTyping();
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
    const authUser = useAuthStore.getState().user;
    if (authUser && authUser.nameIsSet !== true) {
      runWithProfileName(() => void handlePollCreate(pollData));
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
        try {
          await deleteDraftFromComposer({
            userId: user.id,
            contextType,
            contextId: finalContextId,
            chatType: resolvedType,
            previousDraft: null,
          });
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
        return;
      }
      const text = e.clipboardData?.getData('text/plain')?.trim();
      if (text) {
        const urlMatch = text.match(/https?:\/\/[^\s<>"']+/i);
        if (urlMatch?.[0]) {
          const cleaned = urlMatch[0].replace(/[.,);\]}>]+$/g, '');
          if (isEligibleLinkPreviewUrl(cleaned)) prefetchLinkPreview(cleaned);
        }
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
      onStartEditMessage &&
      lastOwnMessage.messageType !== 'VOICE' &&
      lastOwnMessage.messageType !== 'VIDEO' &&
      lastOwnMessage.messageType !== 'STICKER' &&
      !lastOwnMessage.poll
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

  const translationBlockButtonCount =
    (translation.originalMessageBeforeTranslate != null ? 1 : 0) + (translateToLanguage ? 2 : 1);
  const translationBlockStackClassName = [
    'flex min-w-0 flex-row flex-wrap items-end gap-2',
    translationBlockButtonCount > 1
      ? ' -mb-2 -ml-1 rounded-2xl border border-white/50 bg-white/55 p-2 shadow-[0_4px_24px_rgba(0,0,0,0.08),inset_0_1px_0_0_rgba(255,255,255,0.85)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-gray-950/45 dark:shadow-[0_4px_24px_rgba(0,0,0,0.35),inset_0_1px_0_0_rgba(255,255,255,0.06)]'
      : '',
    translateToLanguage ? 'relative overflow-visible' : '',
  ]
    .filter(Boolean)
    .join(' ');

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
      <TranslationLanguageModal
        open={translation.translationModalOpen}
        onClose={() => translation.setTranslationModalOpen(false)}
        onSelect={translation.handleTranslateLanguageSelect}
        selectedLanguageCode={translateToLanguage}
        onRemoveLanguage={translation.handleRemoveTranslateLanguage}
        autoTranslate={autoTranslate}
        preferredTranslationLanguage={preferredTranslationLanguage}
        appLanguageCode={appLanguageCode}
        onPreferredTranslationLanguageChange={handlePreferredTranslationLanguageChange}
      />
      <MessageInputImagePreviewStrip
        imageFiles={selectedImages}
        onRemove={removeImage}
        failedSlotIndices={imageUploadFailedSlots}
        retryingSlotIndex={retryingImageSlot}
        onRetrySlot={handleRetryImageSlot}
      />
      <form onSubmit={handleSubmit} className="relative overflow-visible">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="mb-1 flex min-w-0 items-end justify-between gap-2 overflow-visible">
            <LayoutGroup id="composer-toolbar">
              <motion.div
                layout
                transition={toolbarTransition}
                className="relative flex min-w-0 flex-1 flex-row flex-wrap items-end gap-2 overflow-visible"
              >
                <motion.div
                  layout={!isComposerSearchExpanded}
                  initial={false}
                  animate={{
                    opacity: isComposerSearchExpanded ? 0 : 1,
                    scale: isComposerSearchExpanded ? 0.88 : 1,
                  }}
                  transition={toolbarTransition}
                  className="shrink-0 overflow-visible"
                  style={{
                    pointerEvents: isComposerSearchExpanded ? 'none' : 'auto',
                    position: isComposerSearchExpanded ? 'absolute' : 'relative',
                  }}
                >
                  <MessageInputAttachMenu
                    isDisabled={isDisabled}
                    inputBlocked={inputBlocked}
                    voiceMode={voice.voiceMode}
                    videoBusy={video.videoBusy}
                    onAddImages={(files) => setSelectedImages((prev) => [...prev, ...files])}
                    onAddVideo={(file) => void video.handleVideoFile(file)}
                    onOpenPoll={() => setIsPollModalOpen(true)}
                    onOpenGiphy={() => {
                      setMediaTrayInitialTab('gifs');
                      setIsStickerTrayOpen(true);
                    }}
                  />
                </motion.div>
                <motion.div
                  layout={!isComposerSearchExpanded}
                  initial={false}
                  animate={{
                    opacity: isComposerSearchExpanded ? 0 : 1,
                    scale: isComposerSearchExpanded ? 0.88 : 1,
                  }}
                  transition={toolbarTransition}
                  className="shrink-0 overflow-visible"
                  style={{
                    pointerEvents: isComposerSearchExpanded ? 'none' : 'auto',
                    position: isComposerSearchExpanded ? 'absolute' : 'relative',
                  }}
                >
                  <ChatStickerTrayButton
                    disabled={isDisabled || inputBlocked || voice.voiceMode || sticker.stickerBusy}
                    active={isStickerTrayOpen}
                    onClick={() => {
                      setMediaTrayInitialTab('recent');
                      setIsStickerTrayOpen(true);
                    }}
                  />
                </motion.div>
                <MessageInputSearchToggle
                  disabled={isDisabled || inputBlocked || voice.voiceMode}
                  onExpandedChange={setIsComposerSearchExpanded}
                />
                <motion.div
                  layout={!isComposerSearchExpanded}
                  initial={false}
                  animate={{
                    opacity: isComposerSearchExpanded ? 0 : 1,
                    scale: isComposerSearchExpanded ? 0.88 : 1,
                  }}
                  transition={toolbarTransition}
                  className="overflow-visible"
                  style={{
                    pointerEvents: isComposerSearchExpanded ? 'none' : 'auto',
                    position: isComposerSearchExpanded ? 'absolute' : 'relative',
                  }}
                >
                  <motion.div
                    layout
                    transition={toolbarTransition}
                    className={translationBlockStackClassName}
                  >
                    <TranslateToButton
                      translateToLanguage={translateToLanguage}
                      isTranslating={translation.isTranslating}
                      disabled={isDisabled || inputBlocked}
                      translateDisabled={!message.trim()}
                      onOpenModal={() => translation.setTranslationModalOpen(true)}
                      onTranslate={translation.handleTranslateButtonClick}
                    />
                    {translation.originalMessageBeforeTranslate != null && (
                      <UndoTranslateButton
                        onClick={translation.handleUndoTranslate}
                        disabled={isDisabled || inputBlocked || translation.isTranslating}
                      />
                    )}
                    {translateToLanguage ? (
                      <button
                        type="button"
                        onClick={() => void translation.handleRemoveTranslateLanguage()}
                        disabled={isDisabled || inputBlocked || translation.isTranslating}
                        className="absolute -right-1 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                        title={t('chat.clearTranslationLanguage', { defaultValue: 'Clear translation language' })}
                        aria-label={t('chat.clearTranslationLanguage', { defaultValue: 'Clear translation language' })}
                      >
                        <X size={11} strokeWidth={2.75} aria-hidden />
                      </button>
                    ) : null}
                  </motion.div>
                </motion.div>
              </motion.div>
            </LayoutGroup>
            <MessageInputScrollFab />
          </div>
          <TypingIndicator
            typingUserIds={typingUserIds}
            contextType={contextType}
            chatType={resolvedChatType}
            game={game}
            bug={bug}
            groupChannel={groupChannel}
            userChat={userChatResolved}
            currentUserId={user?.id}
          />
          <MessageInputComposerContextStrip
            editingMessage={editingMessage ?? null}
            replyTo={replyTo ?? null}
            onCancelEdit={onCancelEdit}
            onCancelReply={onCancelReply}
          />
          <ComposerLinkPreview
            urls={composerPreview.urls}
            selectedUrl={composerPreview.selectedUrl}
            preview={composerPreview.preview}
            loading={composerPreview.loading}
            outcome={composerPreview.outcome}
            disabled={composerPreview.disabled}
            canRetry={composerPreview.canRetry}
            onSelect={composerPreview.selectUrl}
            onRemove={composerPreview.remove}
            onRetry={composerPreview.retry}
          />
          <div
            ref={inputContainerRef}
            className={`message-input-panel relative min-w-0 w-full max-w-full overflow-visible rounded-[24px] bg-white transition-all dark:bg-gray-800 ${
              isDragOver ? 'border-2 border-blue-400 dark:border-blue-500 border-dashed' : 'border border-gray-200 dark:border-gray-700'
            }`}
          >
              {reduceMotion ? (
                voice.voiceMode ? (
                  <VoiceRecordingOverlay
                    durationMs={voiceRecorder.durationMs}
                    liveLevels={voiceRecorder.liveLevels}
                    busy={voice.voiceBusy}
                    onCancel={voice.handleVoiceCancel}
                    onConfirm={voice.handleVoiceConfirm}
                  />
                ) : (
                  <>
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
                        className="message-input-action-btn absolute bottom-0.5 right-[2px] z-10 flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 text-white transition-all duration-200 hover:scale-105 hover:from-blue-600 hover:via-blue-700 hover:to-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={inputBlocked ? t('common.sending') : t('chat.messages.sendMessage')}
                      >
                        {inputBlocked ? (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        ) : (
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                          </svg>
                        )}
                      </button>
                    )}
                  </>
                )
              ) : (
                <AnimatePresence initial={false} mode="wait">
                  {voice.voiceMode ? (
                    <motion.div
                      key="voice"
                      className="w-full"
                      initial={{ opacity: 0, y: PANEL_ENTER_Y }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: PANEL_EXIT_Y }}
                      transition={CHAT_PANEL_TRANSITION}
                    >
                      <VoiceRecordingOverlay
                        durationMs={voiceRecorder.durationMs}
                        liveLevels={voiceRecorder.liveLevels}
                        busy={voice.voiceBusy}
                        onCancel={voice.handleVoiceCancel}
                        onConfirm={voice.handleVoiceConfirm}
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="text"
                      className="relative w-full"
                      initial={{ opacity: 0, y: PANEL_ENTER_Y }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: PANEL_EXIT_Y }}
                      transition={CHAT_PANEL_TRANSITION}
                    >
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
                          className="message-input-action-btn absolute bottom-0.5 right-[2px] z-10 flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 text-white transition-all duration-200 hover:scale-105 hover:from-blue-600 hover:via-blue-700 hover:to-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label={inputBlocked ? t('common.sending') : t('chat.messages.sendMessage')}
                        >
                          {inputBlocked ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          ) : (
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                          )}
                        </button>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
          </div>
        </div>
      </form>
      <PollCreationModal isOpen={isPollModalOpen} onClose={() => setIsPollModalOpen(false)} onSubmit={handlePollCreate} />
      <ChatStickerTray
        open={isStickerTrayOpen}
        onClose={() => setIsStickerTrayOpen(false)}
        onSelectSticker={(s) => void sticker.sendSticker(s)}
        onSelectGif={(item) => void giphy.sendGiphy(item)}
        initialTab={mediaTrayInitialTab}
        sport={game?.sport ?? null}
        busy={sticker.stickerBusy || giphy.giphyBusy}
      />
    </div>
  );
};
