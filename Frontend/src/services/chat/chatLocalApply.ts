import type { ChatSyncEventDTO } from '@/services/chat/chatSyncEventTypes';
import { ensureChatLocalCoopListener } from './chatLocalCoop';

export type { ChatSyncEventDTO };

ensureChatLocalCoopListener();

export { withChatLocalBulkApply } from './chatLocalApplyBulk';
export {
  reconcileCursorWithServerHead,
  getLocalCursorSeq,
  getLastAppliedSyncSeq,
} from './chatLocalApplyCursor';
export { pullAndApplyChatSyncEvents } from './chatLocalApplyPull';
export {
  putLocalMessage,
  persistChatMessagesFromApi,
  markLocalMessageDeleted,
  applyLocalMessageEditOptimistic,
  applyLocalReactionOptimisticReplace,
} from './chatLocalApplyWrite';
export {
  patchLocalTranscription,
  patchLocalReadReceipt,
  patchLocalPoll,
  persistReactionSocketPayload,
} from './chatLocalApplyPatchFields';
export {
  onSocketSyncSeq,
  persistSocketInboundMessage,
  persistSocketPatchThenSyncSeq,
  persistSocketTranscriptionAndSyncSeq,
  persistSocketPollVoteAndSyncSeq,
} from './chatLocalApplySocketInbound';
export {
  loadLocalMessagesForThread,
  loadLocalMessagesForThreadProgressive,
  loadLocalMessagesOlderThan,
  loadLocalThreadBootstrap,
  type LocalThreadBootstrapResult,
} from './chatLocalApplyThreadLoad';
