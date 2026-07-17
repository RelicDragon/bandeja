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
  const ackAbort = new AbortController();
  const onParentAbort = () => {
    httpAbort.abort();
    ackAbort.abort();
  };
  if (signal?.aborted) onParentAbort();
  else signal?.addEventListener('abort', onParentAbort, { once: true });

  const httpPromise = chatApi.createMessage(request, { signal: httpAbort.signal });

  const ackPromise = waitForChatSendSocketAck({
    contextType,
    contextId,
    clientMutationId: cid,
    signal: ackAbort.signal,
    timeoutMs: SEND_API_PHASE_MS,
  }).then((msg) => {
    if (msg && !httpAbort.signal.aborted) httpAbort.abort();
    return msg;
  });

  return new Promise<ChatMessage>((resolve, reject) => {
    let settled = false;
    let failures = 0;
    let lastFailure: unknown = new Error('send_failed');
    const cleanup = () => signal?.removeEventListener('abort', onParentAbort);

    const succeed = (message: ChatMessage, viaSocket: boolean) => {
      if (settled) return;
      settled = true;
      if (viaSocket) {
        recordChatSendMetric({
          kind: 'chat_send_socket_ack',
          tempId,
          contextType,
          contextId,
        });
        if (!httpAbort.signal.aborted) httpAbort.abort();
      } else if (!ackAbort.signal.aborted) {
        ackAbort.abort();
      }
      cleanup();
      resolve(message);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      failures += 1;
      lastFailure = error;
      if (failures === 2) {
        settled = true;
        cleanup();
        reject(lastFailure);
      }
    };

    void httpPromise.then((message) => succeed(message, false), fail);
    void ackPromise.then(
      (message) => {
        if (message) succeed(message, true);
        else fail(new Error('socket_ack_missing'));
      },
      fail
    );
  });
}
