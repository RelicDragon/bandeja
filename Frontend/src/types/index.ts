export type AuthProvider = 'PHONE' | 'TELEGRAM';
export type InviteStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED';
export type GameType = 'CLASSIC' | 'AMERICANO' | 'MEXICANO' | 'ROUND_ROBIN' | 'WINNER_COURT';
export type EntityType = 'GAME' | 'TOURNAMENT' | 'LEAGUE' | 'BAR' | 'TRAINING';
export type ParticipantRole = 'OWNER' | 'ADMIN' | 'PARTICIPANT' | 'GUEST';
export type Gender = 'MALE' | 'FEMALE' | 'PREFER_NOT_TO_SAY';
export type GameStatus = 'ANNOUNCED' | 'READY' | 'STARTED' | 'FINISHED' | 'ARCHIVED';
export type ChatType = 'PUBLIC' | 'PRIVATE' | 'ADMINS';
export type BugStatus = 'CREATED' | 'CONFIRMED' | 'IN_PROGRESS' | 'TEST' | 'FINISHED' | 'ARCHIVED';
export type BugType = 'BUG' | 'CRITICAL' | 'SUGGESTION' | 'QUESTION';

export interface User {
  id: string;
  phone?: string;
  email?: string;
  telegramId?: string;
  telegramUsername?: string;
  firstName?: string;
  lastName?: string;
  avatar?: string | null;
  originalAvatar?: string | null;
  authProvider: AuthProvider;
  currentCityId?: string;
  currentCity?: City;
  level: number;
  socialLevel: number;
  reliability: number;
  totalPoints: number;
  gamesPlayed: number;
  gamesWon: number;
  language?: string;
  gender: Gender;
  isAdmin?: boolean;
  isTrainer?: boolean;
  preferredHandLeft?: boolean;
  preferredHandRight?: boolean;
  preferredCourtSideLeft?: boolean;
  preferredCourtSideRight?: boolean;
}

export interface City {
  id: string;
  name: string;
  country: string;
  timezone: string;
  isActive: boolean;
}

export interface Club {
  id: string;
  name: string;
  description?: string;
  address: string;
  cityId: string;
  phone?: string;
  email?: string;
  website?: string;
  latitude?: number;
  longitude?: number;
  openingTime?: string;
  closingTime?: string;
  amenities?: Record<string, any>;
  isBar?: boolean;
  isForPlaying?: boolean;
  courts?: Court[];
  city?: City;
}

export interface Court {
  id: string;
  name: string;
  clubId: string;
  courtType?: string;
  isIndoor: boolean;
  surfaceType?: string;
  pricePerHour?: number;
  club?: Club;
}

export interface GameParticipant {
  userId: string;
  role: ParticipantRole;
  isPlaying: boolean;
  joinedAt: string;
  user: {
    id: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    level: number;
    gender: Gender;
  };
}

export interface GameTeamPlayer {
  id: string;
  gameTeamId: string;
  userId: string;
  user: {
    id: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    level: number;
    gender: Gender;
  };
}

export interface GameTeam {
  id: string;
  gameId: string;
  teamNumber: number;
  name?: string;
  players: GameTeamPlayer[];
}

export interface GameTeamData {
  teamNumber: number;
  name?: string;
  playerIds: string[];
}

export interface Game {
  id: string;
  entityType: EntityType;
  gameType: GameType;
  name?: string;
  description?: string;
  clubId?: string;
  club?: Club;
  courtId?: string;
  court?: Court;
  startTime: string;
  endTime: string;
  maxParticipants: number;
  minParticipants: number;
  minLevel?: number;
  maxLevel?: number;
  isPublic: boolean;
  affectsRating: boolean;
  anyoneCanInvite?: boolean;
  resultsByAnyone?: boolean;
  hasBookedCourt?: boolean;
  afterGameGoToBar?: boolean;
  hasFixedTeams?: boolean;
  teamsReady?: boolean;
  participantsReady?: boolean;
  status: GameStatus;
  hasResults: boolean;
  isClubFavorite?: boolean;
  participants: GameParticipant[];
  invites?: Invite[];
  fixedTeams?: GameTeam[];
  parentId?: string;
  children?: Game[];
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}


export interface Invite {
  id: string;
  senderId: string;
  receiverId: string;
  gameId?: string;
  status: InviteStatus;
  message?: string;
  expiresAt?: string;
  createdAt: string;
  sender: {
    id: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    level: number;
    gender: Gender;
  };
  receiver?: {
    id: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    level: number;
    gender: Gender;
  };
  game?: Game;
}

export interface Bug {
  id: string;
  text: string;
  senderId: string;
  status: BugStatus;
  bugType: BugType;
  createdAt: string;
  updatedAt: string;
  sender: {
    id: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    level?: number;
    gender?: Gender;
    isAdmin?: boolean;
  };
}

export interface BugsResponse {
  bugs: Bug[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  serverTime?: string;
}

export interface LoginResponse {
  user: User;
  token: string;
}