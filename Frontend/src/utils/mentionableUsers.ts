import type { BasicUser, Bug, GameParticipant } from '@/types';
import type { GroupChannelParticipant } from '@/api/chat';
import { normalizeChatType } from '@/utils/chatType';
import { isParticipantPlaying } from '@/utils/participantStatus';
import { isPendingGameInvite } from '@/utils/gameInviteParticipant';

export interface MentionableUser extends BasicUser {
  display: string;
}

function displayName(user: BasicUser): string {
  return `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown';
}

function asParticipantArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function pushUser(users: MentionableUser[], seen: Set<string>, user: BasicUser | null | undefined) {
  if (!user || seen.has(user.id)) return;
  seen.add(user.id);
  users.push({ ...user, display: displayName(user) });
}

export function buildGameMentionableUsers(
  participants: GameParticipant[] | null | undefined,
  parentParticipants: GameParticipant[] | undefined,
  chatType: string
): MentionableUser[] {
  const users: MentionableUser[] = [];
  const seen = new Set<string>();
  const list = asParticipantArray(participants);
  const normalized = normalizeChatType(chatType as import('@/types').ChatType);

  if (normalized === 'PUBLIC') {
    for (const p of list) {
      if (p.user) pushUser(users, seen, p.user);
    }
    for (const p of list.filter(isPendingGameInvite)) {
      if (p.user) pushUser(users, seen, p.user);
    }
    for (const p of parentParticipants?.filter((p) => p.role === 'ADMIN' || p.role === 'OWNER') ?? []) {
      if (p.user) pushUser(users, seen, p.user);
    }
    return users;
  }

  if (normalized === 'ADMINS') {
    for (const p of list.filter((p) => p.role === 'ADMIN' || p.role === 'OWNER')) {
      if (p.user) pushUser(users, seen, p.user);
    }
    for (const p of parentParticipants?.filter((p) => p.role === 'ADMIN' || p.role === 'OWNER') ?? []) {
      if (p.user) pushUser(users, seen, p.user);
    }
    return users;
  }

  if (normalized === 'PRIVATE') {
    for (const p of list.filter(isParticipantPlaying)) {
      if (p.user) pushUser(users, seen, p.user);
    }
    return users;
  }

  for (const p of list) {
    if (p.user) pushUser(users, seen, p.user);
  }
  return users;
}

export function buildGroupMentionableUsers(
  participants: GroupChannelParticipant[] | null | undefined
): MentionableUser[] {
  const users: MentionableUser[] = [];
  const seen = new Set<string>();
  for (const p of asParticipantArray(participants)) {
    if (p.user) pushUser(users, seen, p.user);
  }
  return users;
}

export function buildBugMentionableUsers(bug: Bug): MentionableUser[] {
  const users: MentionableUser[] = [];
  const seen = new Set<string>();
  if (bug.sender) pushUser(users, seen, bug.sender);
  for (const p of bug.participants ?? []) {
    if (p.user) pushUser(users, seen, p.user);
  }
  return users;
}
