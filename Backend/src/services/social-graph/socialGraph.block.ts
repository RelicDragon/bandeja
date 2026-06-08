import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { STORY_ENGAGEMENT_ERROR } from '../storyEngagement/storyEngagement.constants';

export const SOCIAL_GRAPH_INTERACT_CONTEXT = {
  STORY_ENGAGEMENT: 'story_engagement',
  USER_TEAM: 'user_team',
  MARKET_ITEM: 'market_item',
} as const;

export type SocialGraphInteractContext =
  (typeof SOCIAL_GRAPH_INTERACT_CONTEXT)[keyof typeof SOCIAL_GRAPH_INTERACT_CONTEXT];

export async function isBlocked(userA: string, userB: string): Promise<boolean> {
  if (userA === userB) return false;
  const block = await prisma.blockedUser.findFirst({
    where: {
      OR: [
        { userId: userA, blockedUserId: userB },
        { userId: userB, blockedUserId: userA },
      ],
    },
    select: { id: true },
  });
  return !!block;
}

export async function hasBlocked(blockerId: string, blockedId: string): Promise<boolean> {
  if (blockerId === blockedId) return false;
  const block = await prisma.blockedUser.findUnique({
    where: {
      userId_blockedUserId: {
        userId: blockerId,
        blockedUserId: blockedId,
      },
    },
    select: { id: true },
  });
  return !!block;
}

function throwBlockedInteraction(context: SocialGraphInteractContext): never {
  switch (context) {
    case SOCIAL_GRAPH_INTERACT_CONTEXT.STORY_ENGAGEMENT:
      throw new ApiError(403, 'Story engagement forbidden', true, {
        code: STORY_ENGAGEMENT_ERROR.FORBIDDEN,
      });
    case SOCIAL_GRAPH_INTERACT_CONTEXT.USER_TEAM:
      throw new ApiError(403, 'errors.userTeams.blocked');
    case SOCIAL_GRAPH_INTERACT_CONTEXT.MARKET_ITEM:
      throw new ApiError(403, 'Cannot create chat with this user');
    default:
      throw new ApiError(403, 'Interaction forbidden');
  }
}

export async function assertCanInteract(
  userA: string,
  userB: string,
  context: SocialGraphInteractContext,
): Promise<void> {
  if (await isBlocked(userA, userB)) throwBlockedInteraction(context);
}
