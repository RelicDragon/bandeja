import type { BasicUser } from './index';

export type UserTeamMemberStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED';

export interface UserTeamMember {
  id: string;
  teamId: string;
  userId: string;
  status: UserTeamMemberStatus;
  isOwner: boolean;
  joinedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: BasicUser;
}

export interface UserTeam {
  id: string;
  name: string;
  avatar: string | null;
  originalAvatar: string | null;
  cutAngle?: number;
  ownerId: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  owner: BasicUser;
  members: UserTeamMember[];
}

export interface UserTeamMembership {
  id: string;
  teamId: string;
  userId: string;
  status: UserTeamMemberStatus;
  isOwner: boolean;
  joinedAt: string | null;
  createdAt: string;
  updatedAt: string;
  team: UserTeam;
}
