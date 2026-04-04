export const CHAT_MUTATION_FLUSH_FAILED_EVENT = 'bandeja-chat-mutation-flush-failed';
export const CHAT_MUTATION_FLUSH_DONE_EVENT = 'bandeja-chat-mutation-flush-done';

export type ChatMutationFlushFailedDetail = {
  contextType: string;
  contextId: string;
  mutationId: string;
  kind: string;
  error: string;
};
