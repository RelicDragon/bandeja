import type { PushInviteActionScope } from './pushInviteActionToken.service';

/**
 * Registry for push notification action buttons (CONTRACT §5.2).
 *
 * `POST /api/push/invite-action` verifies the signed token and then dispatches
 * on `scope.kind`. The `game` and `team` kinds stay as explicit branches in
 * `controllers/pushInviteAction.controller.ts` (their responses predate this
 * registry and carry a `data` payload). Every **new** kind — `series`,
 * `attendance`, `weather` — plugs in here so no feature agent has to edit the
 * controller.
 *
 * Registration must run at import time of a module the app actually loads.
 * The reliable path is the feature's own service module, which its route file
 * imports (all PRD routers are already mounted from `routes/index.ts`).
 *
 * An unregistered kind answers `400 push.inviteActionUnsupported` — never a 500.
 */
export type PushActionResult = {
  success: boolean;
  /** i18n key (or an already-resolved user-facing string), never an English sentence built here. */
  message: string;
};

export type PushActionHandler = (
  scope: PushInviteActionScope
) => Promise<PushActionResult>;

const handlers = new Map<PushInviteActionScope['kind'], PushActionHandler>();

export function registerPushActionHandler(
  kind: PushInviteActionScope['kind'],
  handler: PushActionHandler
): void {
  handlers.set(kind, handler);
}

export function resolvePushActionHandler(
  kind: PushInviteActionScope['kind']
): PushActionHandler | undefined {
  return handlers.get(kind);
}

/** Test helper — drops every registration so suites stay independent. */
export function resetPushActionHandlersForTests(): void {
  handlers.clear();
}
