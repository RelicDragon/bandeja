import type { ChatSyncEventDTO } from '@/services/chat/chatSyncEventTypes';
import { ensureChatLocalCoopListener } from './chatLocalCoop';

export type { ChatSyncEventDTO };

ensureChatLocalCoopListener();

export { withChatLocalBulkApply } from './chatLocalApplyBulk';
export {
  reconcileCursorWithServerHead,
  getLocalCursorSeq,
  getLastAppliedSyncSeq,
  bumpCursor,
} from './chatLocalApplyCursor';
export { pullAndApplyChatSyncEvents } from './chatLocalApplyPull';
export {
  putLocalMessage,
  putLocalMessageDirect,
  persistChatMessagesFromApi,
  persistChatMessagesFromApiDirect,
  markLocalMessageDeleted,
  applyLocalMessageEditOptimistic,
  applyLocalReactionOptimisticReplace,
} from './chatLocalApplyWrite';
export {
  patchLocalTranscription,
  patchLocalReadReceipt,
  patchMessageTranslationInDexie,
  removeMessageTranslationInDexie,
  patchLocalPoll,
  persistReactionSocketPayload,
} from './chatLocalApplyPatchFields';
export {
  onSocketSyncSeq,
  persistSocketPatchThenSyncSeq,
  persistSocketTranscriptionAndSyncSeq,
  persistSocketPollVoteAndSyncSeq,
} from './chatLocalApplySocketInbound';
export {
  applyThreadEvent,
  applyThreadL1Put,
  getThreadSnapshotRevision,
  persistSocketInboundMessage,
  subscribeThreadSnapshotRevision,
  threadKeyForApply,
  type ThreadApplyEvent,
} from './chatLocalApplyThreadEvent';
export {
  loadLocalMessagesForThread,
  loadLocalMessagesForThreadProgressive,
  loadLocalMessagesOlderThan,
  loadLocalThreadBootstrap,
  type LocalThreadBootstrapResult,
} from './chatLocalApplyThreadLoad';
export {
  bridgeGetLastMessageId,
  bridgeSetLastMessageId,
  bridgeAddMissedMessages,
  bridgeTakeMissedMessages,
  bridgeBumpChatListDexie,
} from './chatLocalApplyStoreBridge';
