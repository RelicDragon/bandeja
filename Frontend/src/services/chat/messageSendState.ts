import type { ChatMessageWithStatus } from '@/api/chat';

export type MessageSendUiState = 'sent' | 'sending' | 'failed';

export type MessageSendState = {
  uiState: MessageSendUiState;
  isSending: boolean;
  isFailed: boolean;
  isOffline: boolean;
  optimisticId?: string;
  clientMutationId?: string;
};

export function getMessageSendState(message: ChatMessageWithStatus): MessageSendState {
  const optimisticId = message._optimisticId;
  const clientMutationId = message._clientMutationId;
  if (message._status === 'FAILED') {
    return {
      uiState: 'failed',
      isSending: false,
      isFailed: true,
      isOffline: true,
      optimisticId,
      clientMutationId,
    };
  }
  if (message._status === 'SENDING') {
    return {
      uiState: 'sending',
      isSending: true,
      isFailed: false,
      isOffline: true,
      optimisticId,
      clientMutationId,
    };
  }
  return {
    uiState: 'sent',
    isSending: false,
    isFailed: false,
    isOffline: false,
    optimisticId,
    clientMutationId,
  };
}
