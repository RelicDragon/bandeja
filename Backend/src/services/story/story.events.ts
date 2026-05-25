import { Sport } from '@prisma/client';
import prisma from '../../config/database';
import { USER_SELECT_FIELDS, USER_SPORT_PROFILE_SELECT } from '../../utils/constants';
import type { BasicUser } from '../../types/user.types';
import type { StorySegment } from './story.feed.service';
import { projectUserForSportContext } from '../user/userSportProfile.service';
import { resolveSport } from '../../sport/sportRegistry';

const STORY_USER_SELECT = {
  ...USER_SELECT_FIELDS,
  sportProfiles: { select: USER_SPORT_PROFILE_SELECT },
} as const;

function getIo() {
  const socketService = (global as { socketService?: { io?: { to: (room: string) => { emit: (event: string, payload: unknown) => void } } } })
    .socketService;
  return socketService?.io ?? null;
}

async function getFollowerIds(ownerUserId: string): Promise<string[]> {
  const rows = await prisma.userFavoriteUser.findMany({
    where: { favoriteUserId: ownerUserId },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

function resolveStoryEventSport(
  segment: StorySegment,
  user: { primarySport?: Sport | string | null },
): Sport {
  if ('game' in segment && segment.game?.sport) {
    return resolveSport(segment.game.sport);
  }
  return resolveSport(user.primarySport ?? Sport.PADEL);
}

function toBasicUser(u: {
  id: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  level: number;
  socialLevel: number;
  gender: string;
  approvedLevel: boolean;
  isTrainer: boolean;
}): BasicUser {
  return {
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    avatar: u.avatar,
    level: u.level,
    socialLevel: u.socialLevel,
    gender: u.gender,
    approvedLevel: u.approvedLevel,
    isTrainer: u.isTrainer,
  };
}

export async function emitStoryNew(ownerUserId: string, segment: StorySegment) {
  const io = getIo();
  if (!io) return;
  const [followerIds, ownerRow] = await Promise.all([
    getFollowerIds(ownerUserId),
    prisma.user.findUnique({ where: { id: ownerUserId }, select: STORY_USER_SELECT }),
  ]);
  const user = ownerRow
    ? toBasicUser(projectUserForSportContext(ownerRow, resolveStoryEventSport(segment, ownerRow)))
    : undefined;
  for (const uid of followerIds) {
    io.to(`notify-user-${uid}`).emit('story:new', { ownerUserId, segment, user });
  }
}

export async function emitStoryDeleted(ownerUserId: string, segmentKey: string) {
  const io = getIo();
  if (!io) return;
  const followerIds = await getFollowerIds(ownerUserId);
  for (const uid of followerIds) {
    io.to(`notify-user-${uid}`).emit('story:deleted', { ownerUserId, segmentKey });
  }
}

export function emitStoryViewed(ownerUserId: string, segmentKey: string, viewerId: string) {
  const io = getIo();
  if (!io) return;
  io.to(`notify-user-${ownerUserId}`).emit('story:viewed', { ownerUserId, segmentKey, viewerId });
}
