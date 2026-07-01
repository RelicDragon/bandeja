export { UnreadAuthorityService, setUnreadAuthorityDepsForTests } from './unreadAuthority.service';
export { UnreadAuthorityService as UnreadAuthority } from './unreadAuthority.service';
export { MarkAllReadService, setMarkAllReadDepsForTests } from './markAllRead.service';
export { bumpUnreadRevisions, bumpContextRevisionOnly, bumpUserRevisionOnly } from './revisionClocks';
export type { MarkAllReadContext, RecordMarkAllReadResult } from './markAllRead.service';
export type {
  RecordContextChangedParams,
  UnreadAuthorityClock,
  UnreadAuthorityEnvelope,
  UnreadChangeReason,
  UnreadCountAdapter,
} from './types';
