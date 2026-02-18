export type AuthProvider = 'PHONE' | 'TELEGRAM' | 'APPLE' | 'GOOGLE';
export type InviteStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED';
export type GameType = 'CLASSIC' | 'AMERICANO' | 'MEXICANO' | 'ROUND_ROBIN' | 'WINNER_COURT' | 'CUSTOM';
export type EntityType = 'GAME' | 'TOURNAMENT' | 'LEAGUE' | 'LEAGUE_SEASON' | 'BAR' | 'TRAINING';
export type GenderTeam = 'ANY' | 'MEN' | 'WOMEN' | 'MIX_PAIRS';
export type ParticipantRole = 'OWNER' | 'ADMIN' | 'PARTICIPANT' | 'GUEST';
export type ParticipantStatus = 'GUEST' | 'INVITED' | 'IN_QUEUE' | 'PLAYING' | 'NON_PLAYING';
export type Gender = 'MALE' | 'FEMALE' | 'PREFER_NOT_TO_SAY';
export type GameStatus = 'ANNOUNCED' | 'STARTED' | 'FINISHED' | 'ARCHIVED';
export type ResultsStatus = 'NONE' | 'IN_PROGRESS' | 'FINAL';
export type ChatType = 'PUBLIC' | 'PRIVATE' | 'ADMINS' | 'PHOTOS';
export type BugStatus = 'CREATED' | 'CONFIRMED' | 'IN_PROGRESS' | 'TEST' | 'FINISHED' | 'ARCHIVED';
export type BugType = 'BUG' | 'CRITICAL' | 'SUGGESTION' | 'QUESTION' | 'TASK';
export type WinnerOfGame = 'BY_MATCHES_WON' | 'BY_POINTS' | 'BY_SCORES_DELTA' | 'PLAYOFF_FINALS';
export type WinnerOfMatch = 'BY_SETS' | 'BY_SCORES';
export type MatchGenerationType = 'HANDMADE' | 'FIXED' | 'RANDOM' | 'ROUND_ROBIN' | 'ESCALERA' | 'RATING' | 'WINNERS_COURT';
export type PriceType = 'PER_PERSON' | 'PER_TEAM' | 'TOTAL' | 'NOT_KNOWN' | 'FREE';
export type PriceCurrency =
  | 'EUR' | 'USD' | 'GBP' | 'JPY' | 'CNY' | 'CHF' | 'CAD' | 'AUD' | 'NZD'
  | 'SEK' | 'NOK' | 'DKK' | 'PLN' | 'CZK' | 'HUF' | 'RON' | 'BGN'
  | 'RUB' | 'RSD' | 'TRY' | 'INR' | 'BRL' | 'MXN'
  | 'SGD' | 'HKD' | 'KRW' | 'THB' | 'MYR' | 'IDR' | 'PHP';

import type { Round } from './gameResults';

export interface BasicUser {
  id: string;
  firstName?: string;
  lastName?: string;
  avatar?: string | null;
  level: number;
  socialLevel: number;
  gender: Gender;
  approvedLevel: boolean;
  isTrainer: boolean;
  allowMessagesFromNonContacts?: boolean;
  verbalStatus?: string | null;
  bio?: string | null;
}

export interface User extends BasicUser {
  phone?: string;
  email?: string;
  telegramId?: string;
  telegramUsername?: string;
  appleSub?: string;
  appleEmail?: string;
  appleEmailVerified?: boolean;
  googleId?: string;
  googleEmail?: string;
  googleEmailVerified?: boolean;
  originalAvatar?: string | null;
  authProvider: AuthProvider;
  currentCityId?: string;
  currentCity?: City;
  reliability: number;
  totalPoints: number;
  gamesPlayed: number;
  gamesWon: number;
  approvedById?: string | null;
  approvedWhen?: Date | string | null;
  favoriteTrainerId?: string | null;
  approvedBy?: BasicUser | null;
  language?: string; // Full locale (e.g., "en-US", "ru-RU") or "auto"
  timeFormat?: 'auto' | '12h' | '24h';
  weekStart?: 'auto' | 'monday' | 'sunday';
  defaultCurrency?: string;
  genderIsSet?: boolean;
  isAdmin?: boolean;
  canCreateTournament?: boolean;
  canCreateLeague?: boolean;
  preferredHandLeft?: boolean;
  preferredHandRight?: boolean;
  preferredCourtSideLeft?: boolean;
  preferredCourtSideRight?: boolean;
  sendTelegramMessages?: boolean;
  sendTelegramInvites?: boolean;
  sendTelegramDirectMessages?: boolean;
  sendTelegramReminders?: boolean;
  sendTelegramWalletNotifications?: boolean;
  sendPushMessages?: boolean;
  sendPushInvites?: boolean;
  sendPushDirectMessages?: boolean;
  sendPushReminders?: boolean;
  sendPushWalletNotifications?: boolean;
  wallet?: number;
  blockedUserIds?: string[];
  appIcon?: string | null;
}

export interface City {
  id: string;
  name: string;
  country: string;
  timezone: string;
  administrativeArea?: string | null;
  subAdministrativeArea?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  clubsCount?: number;
  telegramGroupId?: string | null;
  isActive: boolean;
}

export interface Club {
  id: string;
  name: string;
  normalizedName?: string;
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

export interface BookedCourtSlot {
  courtId: string | null;
  courtName: string | null;
  startTime: string;
  endTime: string;
  hasBookedCourt: boolean;
  clubBooked: boolean;
  isFree?: boolean;
}

export interface GameParticipant {
  userId: string;
  role: ParticipantRole;
  status: ParticipantStatus;
  joinedAt: string;
  user: BasicUser;
  invitedByUserId?: string | null;
  inviteMessage?: string | null;
  inviteExpiresAt?: string | null;
  invitedByUser?: BasicUser | null;
}

export interface GameTeamPlayer {
  id: string;
  gameTeamId: string;
  userId: string;
  user: BasicUser;
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

export interface GameOutcome {
  id: string;
  gameId: string;
  userId: string;
  levelBefore: number;
  levelAfter: number;
  levelChange: number;
  reliabilityBefore: number;
  reliabilityAfter: number;
  reliabilityChange: number;
  pointsEarned: number;
  position?: number;
  isWinner: boolean;
  wins: number;
  ties: number;
  losses: number;
  scoresMade: number;
  scoresLost: number;
  user: BasicUser;
}

export interface Faq {
  id: string;
  gameId: string;
  question: string;
  answer: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface Game {
  id: string;
  entityType: EntityType;
  gameType: GameType;
  name?: string | null;
  description?: string | null;
  avatar?: string | null;
  originalAvatar?: string | null;
  clubId?: string;
  club?: Club;
  courtId?: string;
  court?: Court;
  city: City;
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
  allowDirectJoin: boolean;
  hasBookedCourt?: boolean;
  afterGameGoToBar?: boolean;
  hasFixedTeams?: boolean;
  genderTeams?: GenderTeam;
  teamsReady?: boolean;
  participantsReady?: boolean;
  status: GameStatus;
  resultsStatus: 'NONE' | 'IN_PROGRESS' | 'FINAL';
  fixedNumberOfSets?: number;
  maxTotalPointsPerSet?: number;
  maxPointsPerTeam?: number;
  winnerOfGame?: WinnerOfGame;
  winnerOfMatch?: WinnerOfMatch;
  matchGenerationType?: MatchGenerationType;
  prohibitMatchesEditing?: boolean;
  pointsPerWin?: number;
  pointsPerLoose?: number;
  pointsPerTie?: number;
  ballsInGames?: boolean;
  photosCount?: number;
  mainPhotoId?: string | null;
  resultsSentToTelegram?: boolean;
  isClubFavorite?: boolean;
  priceTotal?: number | null;
  priceType?: PriceType;
  priceCurrency?: PriceCurrency | null;
  participants: GameParticipant[];
  invites?: Invite[];
  joinQueues?: JoinQueue[];
  fixedTeams?: GameTeam[];
  outcomes?: GameOutcome[];
  rounds?: Round[];
  gameCourts?: Array<{
    id: string;
    gameId: string;
    courtId: string;
    order: number;
    court: Court;
    createdAt: string;
    updatedAt: string;
  }>;
  trainerId?: string | null;
  parentId?: string;
  parent?: {
    id: string;
    participants?: GameParticipant[];
    leagueSeason?: {
      id: string;
      leagueId: string;
      league: {
        id: string;
        name: string;
      };
      game?: {
        id: string;
        name?: string;
        avatar?: string | null;
        originalAvatar?: string | null;
      } | null;
    };
  } | null;
  children?: Game[];
  timeIsSet?: boolean;
  leagueGroupId?: string;
  leagueGroup?: {
    id: string;
    name: string;
    color?: string | null;
  } | null;
  leagueRoundId?: string;
  leagueRound?: {
    id: string;
    orderIndex: number;
  } | null;
  leagueSeason?: {
    id: string;
    leagueId: string;
    league: {
      id: string;
      name: string;
    };
    game?: {
      id: string;
      name?: string;
      avatar?: string | null;
      originalAvatar?: string | null;
    } | null;
  };
  faqs?: Faq[];
  metadata?: Record<string, any>;
  resultsMeta?: {
    version?: number;
    lastBatchTime?: string;
    lastBatchId?: string;
    processedOps?: string[];
  };
  lastMessage?: {
    preview: string;
    updatedAt: string;
  } | null;
  userNote?: string | null;
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
  sender: BasicUser;
  receiver?: BasicUser;
  game?: Game;
}

export interface JoinQueue {
  id: string;
  userId: string;
  gameId: string;
  status: InviteStatus;
  createdAt: string;
  user: BasicUser;
}

export interface Bug {
  id: string;
  text: string;
  senderId: string;
  status: BugStatus;
  bugType: BugType;
  lastMessagePreview?: string | null;
  createdAt: string;
  updatedAt: string;
  sender: User;
  participants?: Array<{
    id: string;
    userId: string;
    joinedAt: string;
    user: User;
  }>;
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

export type BetType = 'SOCIAL' | 'POOL';
export type BetPoolSide = 'WITH_CREATOR' | 'AGAINST_CREATOR';
export type BetStatus = 'OPEN' | 'ACCEPTED' | 'RESOLVED' | 'CANCELLED' | 'NEEDS_REVIEW';
export type BetConditionType = 'PREDEFINED' | 'CUSTOM';
export type BetEntityType = 'USER' | 'TEAM';

export type PredefinedCondition =
  | 'WIN_GAME'
  | 'LOSE_GAME'
  | 'WIN_SET'
  | 'LOSE_SET'
  | 'WIN_ALL_SETS'
  | 'LOSE_ALL_SETS'
  | 'TAKE_PLACE';

export interface BetCondition {
  type: BetConditionType;
  predefined?: PredefinedCondition;
  customText?: string;
  entityType: BetEntityType;
  entityId?: string;
  metadata?: Record<string, any>;
}

export interface BetParticipant {
  id: string;
  betId: string;
  userId: string;
  side: BetPoolSide;
  user: BasicUser;
  createdAt: string;
}

export interface Bet {
  id: string;
  gameId: string;
  creatorId: string;
  creator: BasicUser;
  type: BetType;
  status: BetStatus;
  condition: BetCondition;
  stakeType: 'COINS' | 'TEXT';
  stakeCoins?: number | null;
  stakeText?: string | null;
  rewardType: 'COINS' | 'TEXT';
  rewardCoins?: number | null;
  rewardText?: string | null;
  poolTotalCoins?: number | null;
  participants?: BetParticipant[];
  acceptedBy?: string;
  acceptedByUser?: BasicUser;
  acceptedAt?: string;
  winnerId?: string;
  winner?: BasicUser;
  resolvedAt?: string;
  resolutionReason?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export type MarketItemTradeType = 'BUY_IT_NOW' | 'SUGGESTED_PRICE' | 'AUCTION' | 'FREE';
export type MarketItemStatus = 'ACTIVE' | 'SOLD' | 'RESERVED' | 'WITHDRAWN';
export type AuctionType = 'RISING' | 'HOLLAND';

export interface MarketItemCategory {
  id: string;
  name: string;
  order?: number;
}

export interface MarketItem {
  id: string;
  sellerId: string;
  categoryId: string;
  cityId: string;
  additionalCityIds?: string[];
  title: string;
  description?: string | null;
  mediaUrls: string[];
  tradeTypes: MarketItemTradeType[];
  negotiationAcceptable?: boolean | null;
  priceCents?: number | null;
  currency: PriceCurrency;
  auctionEndsAt?: string | null;
  auctionType?: AuctionType | null;
  startingPriceCents?: number | null;
  reservePriceCents?: number | null;
  buyItNowPriceCents?: number | null;
  currentPriceCents?: number | null;
  hollandDecrementCents?: number | null;
  hollandIntervalMinutes?: number | null;
  winnerId?: string | null;
  status: MarketItemStatus;
  createdAt: string;
  updatedAt: string;
  seller?: BasicUser;
  category?: MarketItemCategory;
  city?: City;
  groupChannel?: { id: string };
  groupChannels?: { id: string }[];
  isParticipant?: boolean;
}

export interface MarketItemBid {
  id: string;
  marketItemId: string;
  bidderId: string;
  amountCents: number;
  outbidAt?: string | null;
  createdAt: string;
  bidder?: BasicUser;
}

export interface MarketItemBidsResponse {
  bids: MarketItemBid[];
  currentHighCents: number | null;
  currentHighBidderId: string | null;
  minNextBidCents: number;
  bidCount: number;
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