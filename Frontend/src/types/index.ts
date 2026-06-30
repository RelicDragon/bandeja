import type { Sport } from '@shared/sport';

export type { Sport };

export type SportLevelSource = 'DEFAULT' | 'QUESTIONNAIRE' | 'MANUAL' | 'PLAYTOMIC';

export interface UserSportProfile {
  sport: Sport;
  level: number;
  reliability: number;
  gamesPlayed: number;
  gamesWon: number;
  questionnaireCompletedAt?: string | null;
  questionnaireSkippedAt?: string | null;
  questionnaireVersion?: string | null;
  levelSource?: SportLevelSource;
  /** Manual or imported external scale (DUPR, NTRP, Playtomic, etc.) — profile only. */
  externalRatingHint?: string | null;
}

export type InviteStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED';
export type GameType =
  | 'CLASSIC'
  | 'AMERICANO'
  | 'MEXICANO'
  | 'ROUND_ROBIN'
  | 'WINNER_COURT'
  | 'LADDER'
  | 'KOTC'
  | 'CUSTOM';
export type EntityType = 'GAME' | 'TOURNAMENT' | 'LEAGUE' | 'LEAGUE_SEASON' | 'BAR' | 'TRAINING';
export type GenderTeam = 'ANY' | 'MEN' | 'WOMEN' | 'MIX_PAIRS';
export type ParticipantRole = 'OWNER' | 'ADMIN' | 'PARTICIPANT' | 'GUEST';
export type ParticipantStatus =
  | 'GUEST'
  | 'INVITED'
  | 'IN_QUEUE'
  | 'PLAYING'
  | 'NON_PLAYING';

export type GameInviteOutcomeType = 'DECLINED' | 'CANCELLED';

export interface GameInviteOutcome {
  id: string;
  gameId: string;
  userId: string;
  outcome: GameInviteOutcomeType;
  invitedByUserId?: string | null;
  closedAt: string;
  user: BasicUser;
  invitedByUser?: BasicUser | null;
}
export type Gender = 'MALE' | 'FEMALE' | 'PREFER_NOT_TO_SAY';
export type GameStatus = 'ANNOUNCED' | 'STARTED' | 'FINISHED' | 'ARCHIVED';
export type ResultsStatus = 'NONE' | 'IN_PROGRESS' | 'FINAL';
export type ChatType = 'PUBLIC' | 'PRIVATE' | 'ADMINS';
export type BugStatus = 'CREATED' | 'CONFIRMED' | 'IN_PROGRESS' | 'TEST' | 'FINISHED' | 'ARCHIVED';
export type BugType = 'BUG' | 'CRITICAL' | 'SUGGESTION' | 'QUESTION' | 'TASK';
export type BugPriority = -2 | -1 | 0 | 1 | 2;
export type WinnerOfGame = 'BY_MATCHES_WON' | 'BY_POINTS' | 'BY_SCORES_DELTA' | 'BY_SCORES_MADE' | 'PLAYOFF_FINALS';
export type WinnerOfMatch = 'BY_SETS' | 'BY_SCORES';
export type MatchGenerationType =
  | 'HANDMADE'
  | 'AUTOMATIC'
  | 'FIXED'
  | 'RANDOM'
  | 'ROUND_ROBIN'
  | 'ESCALERA'
  | 'RATING'
  | 'WINNERS_COURT'
  | 'KING_OF_COURT';
export type ScoringMode = 'CLASSIC' | 'POINTS';
export type ScoringPreset =
  | 'CLASSIC_BEST_OF_3'
  | 'CLASSIC_BEST_OF_5'
  | 'CLASSIC_PRO_SET'
  | 'CLASSIC_SHORT_SET'
  | 'CLASSIC_FAST4'
  | 'CLASSIC_SUPER_TIEBREAK'
  | 'CLASSIC_SINGLE_SET'
  | 'CLASSIC_TIMED'
  | 'POINTS_11'
  | 'POINTS_12'
  | 'POINTS_15'
  | 'POINTS_16'
  | 'POINTS_21'
  | 'POINTS_24'
  | 'POINTS_32'
  | 'BEST_OF_3_11'
  | 'BEST_OF_3_15'
  | 'BEST_OF_3_21'
  | 'BEST_OF_5_11'
  | 'PAR_11'
  | 'SINGLE_GAME_21'
  | 'TIMED'
  | 'CUSTOM';
export interface GameSetupParams {
  fixedNumberOfSets: number;
  maxTotalPointsPerSet: number;
  matchTimerEnabled?: boolean;
  /** Minutes per match when `matchTimerEnabled`; 0 otherwise. */
  matchTimedCapMinutes: number;
  maxPointsPerTeam: number;
  winnerOfGame: WinnerOfGame;
  winnerOfMatch: WinnerOfMatch;
  matchGenerationType: MatchGenerationType;
  pointsPerWin: number;
  pointsPerLoose: number;
  pointsPerTie: number;
  ballsInGames: boolean;
  scoringPreset?: ScoringPreset | null;
  deucesBeforeGoldenPoint?: number | null;
  /** Stored on `Game` when API supports it (e.g. playoff create); not always set by `buildSetupFromFormat`. */
  scoringMode?: ScoringMode;
}
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
  /**
   * Competitive level for the current sport context when API-projected; populated from `sportProfiles` on profile payloads.
   * @deprecated Prefer `sportProfiles` for the relevant sport, or `getDisplayLevelForSport`.
   */
  level: number;
  primarySport?: Sport;
  sportsEnabled?: Sport[];
  socialLevel: number;
  /** @deprecated Prefer `sportProfiles` for the relevant sport. */
  reliability?: number;
  gender: Gender;
  approvedLevel: boolean;
  isTrainer: boolean;
  allowMessagesFromNonContacts?: boolean;
  verbalStatus?: string | null;
  bio?: string | null;
  trainerRating?: number | null;
  trainerReviewCount?: number;
  isPremium?: boolean;
  weeklyAvailability?: WeeklyAvailabilityDoc | null;
  isAdmin?: boolean;
  canCreateTournament?: boolean;
  maxParticipantsInGame?: number;
  sportProfiles?: UserSportProfile[];
}

export interface TrainerReview {
  id: string;
  trainerId: string;
  reviewerId: string;
  gameId: string;
  stars: number;
  text?: string | null;
  createdAt: string;
  updatedAt?: string;
  reviewer?: BasicUser;
}

export interface TrainerReviewSummary {
  rating: number | null;
  reviewCount: number;
}

export interface WeeklyAvailability {
  mon: number;
  tue: number;
  wed: number;
  thu: number;
  fri: number;
  sat: number;
  sun: number;
  v: 1;
}

export interface RollingWeeklyAvailabilityV2 {
  v: 2;
  anchor: string;
  baseline: WeeklyAvailability | null;
  weeks: [WeeklyAvailability | null, WeeklyAvailability | null, WeeklyAvailability | null];
}

export type WeeklyAvailabilityDoc = WeeklyAvailability | RollingWeeklyAvailabilityV2;

export interface AvailabilityBucketBoundaries {
  night: number;
  morning: number;
  afternoon: number;
  evening: number;
}

export type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

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
  currentCityId?: string;
  currentCity?: City;
  /** @deprecated Prefer `sportProfiles` for the relevant sport; API-populated from primary sport profile. */
  reliability: number;
  totalPoints: number;
  /** @deprecated Prefer `sportProfiles` for the relevant sport; API-populated from primary sport profile. */
  gamesPlayed: number;
  /** @deprecated Prefer `sportProfiles` for the relevant sport; API-populated from primary sport profile. */
  gamesWon: number;
  approvedById?: string | null;
  approvedWhen?: Date | string | null;
  favoriteTrainerId?: string | null;
  approvedBy?: BasicUser | null;
  language?: string; // Full locale (e.g., "en-GB", "ru-RU") or "auto"
  translateToLanguage?: string | null;
  timeFormat?: 'auto' | '12h' | '24h';
  weekStart?: 'auto' | 'monday' | 'sunday';
  defaultCurrency?: string;
  genderIsSet?: boolean;
  nameIsSet?: boolean;
  primarySportIsSet?: boolean;
  cityIsSet?: boolean;
  welcomeScreenPassed?: boolean;
  booktimeConnectHintDismissed?: boolean;
  sportsEnabled?: Sport[];
  lastCreatedSport?: Sport | null;
  sportsPlayed?: Partial<Record<Sport, number>>;
  sportProfiles?: UserSportProfile[];
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
  showOnlineStatus?: boolean;
  alwaysShowUserNames?: boolean;
  shareGamePhotosToFollowers?: boolean;
  shareGameCreationsToFollowers?: boolean;
  shareGameResultsToFollowers?: boolean;
  appIcon?: string | null;
  weeklyAvailability?: WeeklyAvailabilityDoc | null;
  availabilityBucketBoundaries?: AvailabilityBucketBoundaries | null;
  clubAdminClubs?: { id: string; name: string; avatar?: string | null }[];
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

export interface ClubPhoto {
  thumbnailUrl: string;
  originalUrl: string;
}

export interface ClubReviewSummary {
  rating: number | null;
  reviewCount: number;
}

export interface ClubReview {
  id: string;
  clubId: string;
  reviewerId: string;
  gameId: string;
  stars: number;
  text?: string | null;
  photos?: ClubPhoto[] | null;
  createdAt: string;
  updatedAt: string;
  reviewer?: BasicUser;
}

export interface Club {
  id: string;
  name: string;
  normalizedName?: string;
  description?: string;
  avatar?: string | null;
  originalAvatar?: string | null;
  photos?: ClubPhoto[] | null;
  carouselPhotos?: ClubPhoto[] | null;
  clubRating?: number | null;
  clubReviewCount?: number;
  address: string;
  cityId: string;
  phone?: string;
  email?: string;
  website?: string;
  latitude?: number;
  longitude?: number;
  openingTime?: string;
  closingTime?: string;
  defaultSlotMinutes?: number | null;
  cancellationNoticeHours?: number | null;
  policyText?: string | null;
  amenities?: Record<string, any>;
  isBar?: boolean;
  isForPlaying?: boolean;
  integrationType?: 'BOOKTIME' | null;
  integrationConfig?: {
    companyId?: string;
    termsUrl?: string;
    privacyUrl?: string;
    serviceIds?: string[];
  } | null;
  sports?: Sport[];
  courts?: Court[];
  city?: City;
}

export interface Court {
  id: string;
  name: string;
  clubId: string;
  sport?: Sport | null;
  courtType?: string;
  isIndoor: boolean;
  isActive?: boolean;
  surfaceType?: string;
  pricePerHour?: number;
  externalCourtId?: string;
  integrationCourtName?: string | null;
  webCameraUrl?: string | null;
  club?: Club;
}

export interface BookedCourtSlot {
  courtId: string | null;
  courtName: string | null;
  integrationCourtName?: string | null;
  startTime: string;
  endTime: string;
  hasBookedCourt: boolean;
  clubBooked: boolean;
  isFree?: boolean;
  slotKind?: 'game' | 'external' | 'hold';
  holdBlocked?: boolean;
}

export interface GameParticipant {
  id?: string;
  userId: string;
  role: ParticipantRole;
  status: ParticipantStatus;
  joinedAt: string;
  user: BasicUser;
  invitedByUserId?: string | null;
  inviteMessage?: string | null;
  inviteExpiresAt?: string | null;
  inviteClosedAt?: string | null;
  inviteUserTeamId?: string | null;
  invitedByUser?: BasicUser | null;
  /** Watch scoring session: current match id or null */
  activeMatchId?: string | null;
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

export type GameLastMessagePreview = {
  preview: string;
  updatedAt: string;
  senderId?: string | null;
  sender?: BasicUser | null;
};

export type GameResultsArtifactsStatus = 'none' | 'pending' | 'running' | 'done' | 'failed';

export interface GameResultsArtifacts {
  status: GameResultsArtifactsStatus;
  version: number;
  summaryReady: boolean;
  summaryInFlight: boolean;
  photoReady: boolean;
  photoInFlight: boolean;
  photoGenerationsUsed: number;
  photoGenerationsRemaining: number;
  photoGenerationsMax: number;
  readyAt: string | null;
}

export type WeatherConditionKey =
  | 'clear'
  | 'mainly_clear'
  | 'partly_cloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'freezing_rain'
  | 'snow'
  | 'showers'
  | 'thunderstorm'
  | 'unknown';

export interface WeatherHourlyPoint {
  time: string;
  temperatureC: number;
  temperatureF: number;
  weatherCode: number;
  conditionKey: WeatherConditionKey;
  precipitationProbability: number | null;
  precipitationMm: number | null;
  windSpeedKmh: number | null;
  relativeHumidity: number | null;
  isDay: boolean | null;
}

export interface WeatherSummary extends WeatherHourlyPoint {
  provider: 'open-meteo';
  fetchedAt: string;
  stale: boolean;
}

export interface WeatherWindow {
  provider: 'open-meteo';
  cityId: string;
  cityName: string;
  cityTimezone: string;
  fetchedAt: string;
  stale: boolean;
  available: boolean;
  summary: WeatherSummary | null;
  hours: WeatherHourlyPoint[];
  attribution: 'Open-Meteo';
  unavailableReason?: 'missing_city_coordinates' | 'out_of_range' | 'not_scheduled';
}

export interface Game {
  id: string;
  entityType: EntityType;
  sport?: Sport;
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
  playersPerMatch?: number;
  minParticipants: number;
  minLevel?: number;
  maxLevel?: number;
  isPublic: boolean;
  affectsRating: boolean;
  anyoneCanInvite?: boolean;
  resultsByAnyone?: boolean;
  allowDirectJoin: boolean;
  hasBookedCourt?: boolean;
  bookingStatus?: 'NONE' | 'MANUAL' | 'EXTERNAL_PARTIAL' | 'EXTERNAL_FULL';
  timeOverride?: boolean;
  linkedBookings?: Array<{
    id: string;
    externalBookingId: string;
    externalBookingProvider: 'BOOKTIME';
    courtId?: string;
    bookingStart?: string;
    bookingEnd?: string;
  }>;
  afterGameGoToBar?: boolean;
  hasFixedTeams?: boolean;
  allowUserInMultipleTeams?: boolean;
  genderTeams?: GenderTeam;
  teamsReady?: boolean;
  participantsReady?: boolean;
  status: GameStatus;
  resultsStatus: 'NONE' | 'IN_PROGRESS' | 'FINAL';
  fixedNumberOfSets?: number;
  maxTotalPointsPerSet?: number;
  matchTimedCapMinutes?: number;
  matchTimerEnabled?: boolean;
  maxPointsPerTeam?: number;
  winnerOfGame?: WinnerOfGame;
  winnerOfMatch?: WinnerOfMatch;
  matchGenerationType?: MatchGenerationType;
  pointsPerWin?: number;
  pointsPerLoose?: number;
  pointsPerTie?: number;
  ballsInGames?: boolean;
  scoringPreset?: ScoringPreset | null;
  scoringMode?: ScoringMode | null;
  deucesBeforeGoldenPoint?: number | null;
  forbidOthersPhotosView?: boolean;
  photosCount?: number;
  mainPhotoId?: string | null;
  mainPhoto?: {
    id: string;
    thumbnailUrl: string;
    originalUrl: string;
  } | null;
  reactions?: Array<{ userId: string; emoji: string }>;
  resultsSentToTelegram?: boolean;
  resultsSummaryText?: string | null;
  resultsArtifacts?: GameResultsArtifacts;
  weatherSummary?: WeatherSummary | null;
  isClubFavorite?: boolean;
  priceTotal?: number | null;
  priceType?: PriceType;
  priceCurrency?: PriceCurrency | null;
  participants: GameParticipant[];
  inviteOutcomes?: GameInviteOutcome[];
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
    status?: GameStatus;
    resultsStatus?: 'NONE' | 'IN_PROGRESS' | 'FINAL';
    entityType?: EntityType;
    participants?: GameParticipant[];
    leagueSeason?: {
      id: string;
      leagueId: string;
      sport?: Sport;
      league: {
        id: string;
        name: string;
      };
      game?: {
        id: string;
        name?: string;
        avatar?: string | null;
        originalAvatar?: string | null;
        sport?: Sport;
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
    roundType?: 'REGULAR' | 'PLAYOFF';
    playoffFormat?: 'BRACKET' | 'WINNERS_COURT' | 'AMERICANO' | null;
    bracketScope?: 'PER_GROUP' | 'CROSS_GROUP' | null;
  } | null;
  bracketSlot?: {
    slotKind?: 'PLAY_IN' | 'BYE' | 'MAIN' | 'THIRD_PLACE' | 'CONSOLATION' | 'LOSERS' | 'GRAND_FINAL';
    roundIndex?: number;
  } | null;
  leagueSeason?: {
    id: string;
    leagueId: string;
    sport?: Sport;
    league: {
      id: string;
      name: string;
    };
    game?: {
      id: string;
      name?: string;
      avatar?: string | null;
      originalAvatar?: string | null;
      sport?: Sport;
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
  lastMessage?: GameLastMessagePreview | import('@/api/chat').ChatMessage | null;
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
  priority: number;
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
  sport?: Sport;
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
  meta?: Record<string, unknown>;
}

export interface LoginResponse {
  user: User;
  token: string;
  refreshToken?: string;
  currentSessionId?: string;
}

export type AuthSessionRow = {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  deviceLabel: string | null;
  platform: string;
  userAgent: string | null;
  ip: string | null;
};

export type { UserTeam, UserTeamMember, UserTeamMembership, UserTeamMemberStatus } from './userTeam';
