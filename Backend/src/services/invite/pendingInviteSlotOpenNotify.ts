import type { InboxInviteDto } from './pendingInviteShape';

export type SlotOpenInviteNotifier = {
  sendPush: (invite: InboxInviteDto) => Promise<void>;
  emitNewInvite: (receiverId: string, invite: InboxInviteDto) => void;
};

export async function deliverSlotOpenInviteNotifications(
  invites: InboxInviteDto[],
  notifier: SlotOpenInviteNotifier,
): Promise<number> {
  for (const invite of invites) {
    await notifier.sendPush(invite);
    notifier.emitNewInvite(invite.receiverId, invite);
  }
  return invites.length;
}
