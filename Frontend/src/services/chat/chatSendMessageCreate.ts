import { chatApi, type ChatContextType, type ChatMessage, type CreateMessageRequest } from '@/api/chat';
import { recordChatSendMetric } from '@/services/chat/chatSendMetrics';
import { waitForChatSendSocketAck } from '@/services/chat/chatSendSocketAck';
import { SEND_API_PHASE_MS, runWithAbort } from '@/services/chat/chatSendCoordinator';

/** Race HTTP createMessage vs socket ack; abort HTTP when socket wins first. */
export async function createMessageWithSocketAck(
  request: CreateMessageRequest,
  contextType: ChatContextType,
  contextId: string,
  clientMutationId: string | undefined,
  signal: AbortSignal | undefined,
  tempId: string
): Promise<ChatMessage> {
  const cid = clientMutationId?.trim();
  if (!cid) {
    return runWithAbort(signal, () => chatApi.createMessage(request, { signal }));
  }

  const httpAbort = new AbortController();
  const onParentAbort = () => httpAbort.abort();
  signal?.addEventListener('abort', onParentAbort, { once: true });

  const httpPromise = chatApi.createMessage(request, { signal: httpAbort.signal }).finally(() => {
    signal?.removeEventListener('abort', onParentAbort);
  });

  const ackPromise = waitForChatSendSocketAck({
    contextType,
    contextId,
    clientMutationId: cid,
    signal,
    timeoutMs: SEND_API_PHASE_MS,
  }).then((msg) => {
    if (msg && !httpAbort.signal.aborted) httpAbort.abort();
    return msg;
  });

  const [httpSettled, ackSettled] = await Promise.allSettled([httpPromise, ackPromise]);

  if (ackSettled.status === 'fulfilled' && ackSettled.value) {
    recordChatSendMetric({
      kind: 'chat_send_socket_ack',
      tempId,
      contextType,
      contextId,
    });
    return ackSettled.value;
  }

  if (httpSettled.status === 'fulfilled') return httpSettled.value;
  throw httpSettled.status === 'rejected' ? httpSettled.reason : new Error('send_failed');
}
