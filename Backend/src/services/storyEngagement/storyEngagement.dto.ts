import type { BasicUser } from '../../types/user.types';

export type StoryCommentDto = {
  id: string;
  body: string;
  createdAt: string;
  author: BasicUser;
  likeCount: number;
  viewerHasLiked: boolean;
  segmentOwnerHasLiked: boolean;
  replyCount: number;
  isSegmentOwner: boolean;
  parentId?: string | null;
  deletedAt?: string | null;
  previewReplies?: StoryCommentDto[];
};

export function parseCommentLikeFlags(
  likes: { userId: string }[],
  viewerId: string,
  ownerUserId: string
): { viewerHasLiked: boolean; segmentOwnerHasLiked: boolean } {
  let viewerHasLiked = false;
  let segmentOwnerHasLiked = false;
  for (const like of likes) {
    if (like.userId === viewerId) viewerHasLiked = true;
    if (like.userId === ownerUserId) segmentOwnerHasLiked = true;
  }
  return { viewerHasLiked, segmentOwnerHasLiked };
}

const DELETED_USER: BasicUser = {
  id: '',
  firstName: 'Deleted user',
  lastName: null,
  avatar: null,
  level: 0,
  socialLevel: 0,
  gender: 'PREFER_NOT_TO_SAY',
  approvedLevel: false,
  isTrainer: false,
};

export type StoryCommentAuthorInput = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  level: number;
  socialLevel: number;
  gender: string;
  approvedLevel: boolean;
  isTrainer: boolean;
  isActive?: boolean;
};

export function mapAuthorToBasicUser(author: StoryCommentAuthorInput): BasicUser {
  if (author.isActive === false) {
    return { ...DELETED_USER, id: author.id };
  }
  return {
    id: author.id,
    firstName: author.firstName,
    lastName: author.lastName,
    avatar: author.avatar,
    level: author.level,
    socialLevel: author.socialLevel,
    gender: author.gender,
    approvedLevel: author.approvedLevel,
    isTrainer: author.isTrainer,
  };
}

export function mapCommentToDto(
  row: {
    id: string;
    body: string;
    createdAt: Date;
    deletedAt: Date | null;
    authorId: string;
    parentId?: string | null;
    author: StoryCommentAuthorInput;
  },
  ownerUserId: string,
  likeCount: number,
  viewerHasLiked: boolean,
  segmentOwnerHasLiked: boolean,
  replyCount = 0,
  previewReplies?: StoryCommentDto[]
): StoryCommentDto {
  return {
    id: row.id,
    body: row.deletedAt ? '' : row.body,
    createdAt: row.createdAt.toISOString(),
    author: mapAuthorToBasicUser(row.author),
    likeCount,
    viewerHasLiked,
    segmentOwnerHasLiked,
    replyCount,
    isSegmentOwner: row.authorId === ownerUserId,
    parentId: row.parentId ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    ...(previewReplies ? { previewReplies } : {}),
  };
}
