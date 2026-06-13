-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "padelpulse";

-- CreateEnum
CREATE TYPE "ClubIntegrationType" AS ENUM ('BOOKTIME');

-- CreateEnum
CREATE TYPE "ClubAdminRole" AS ENUM ('ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "CourtSlotHoldLabel" AS ENUM ('WALK_IN', 'PHONE', 'ACADEMY', 'MAINTENANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "MatchTimerStatus" AS ENUM ('IDLE', 'RUNNING', 'PAUSED', 'STOPPED');

-- CreateEnum
CREATE TYPE "MatchSetRole" AS ENUM ('OFFICIAL', 'EXTRA_GAMES', 'EXTRA_BALLS');

-- CreateEnum
CREATE TYPE "WorkoutSessionSource" AS ENUM ('APPLE_WATCH', 'ANDROID_HEALTH_CONNECT');

-- CreateEnum
CREATE TYPE "GameResultsArtifactJobStatus" AS ENUM ('pending', 'running', 'done', 'failed');

-- CreateEnum
CREATE TYPE "GameResultsArtifactStepStatus" AS ENUM ('pending', 'running', 'done', 'skipped', 'failed');

-- CreateEnum
CREATE TYPE "GamePhotoSource" AS ENUM ('USER', 'AI_GENERATED');

-- CreateEnum
CREATE TYPE "TranslationJobPriority" AS ENUM ('high', 'normal', 'low');

-- CreateEnum
CREATE TYPE "TranslationJobStatus" AS ENUM ('pending', 'running', 'done', 'failed');

-- CreateEnum
CREATE TYPE "TranslationJobSource" AS ENUM ('manual', 'auto', 'backfill');

-- CreateEnum
CREATE TYPE "UserTeamMemberStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "Sport" AS ENUM ('PADEL', 'TENNIS', 'PICKLEBALL', 'BADMINTON', 'TABLE_TENNIS', 'SQUASH');

-- CreateEnum
CREATE TYPE "GameType" AS ENUM ('CLASSIC', 'AMERICANO', 'MEXICANO', 'ROUND_ROBIN', 'WINNER_COURT', 'LADDER', 'KOTC', 'CUSTOM');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('GAME', 'TOURNAMENT', 'LEAGUE', 'LEAGUE_SEASON', 'BAR', 'TRAINING');

-- CreateEnum
CREATE TYPE "GenderTeam" AS ENUM ('ANY', 'MEN', 'WOMEN', 'MIX_PAIRS');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('OWNER', 'ADMIN', 'PARTICIPANT');

-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('GUEST', 'INVITED', 'INVITE_DECLINED', 'INVITE_CANCELLED', 'IN_QUEUE', 'PLAYING', 'NON_PLAYING');

-- CreateEnum
CREATE TYPE "GameInviteOutcomeType" AS ENUM ('DECLINED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MessageState" AS ENUM ('SENT', 'DELIVERED', 'READ');

-- CreateEnum
CREATE TYPE "ChatType" AS ENUM ('PUBLIC', 'PRIVATE', 'ADMINS');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'VOICE', 'VIDEO', 'POLL');

-- CreateEnum
CREATE TYPE "StorySourceType" AS ENUM ('USER_STORY_ITEM', 'GAME_PHOTO', 'GAME_CREATED', 'GAME_RESULT', 'BRACKET_CHAMPION');

-- CreateEnum
CREATE TYPE "ChatContextType" AS ENUM ('GAME', 'BUG', 'USER', 'GROUP');

-- CreateEnum
CREATE TYPE "ChatSyncEventType" AS ENUM ('MESSAGE_CREATED', 'MESSAGE_UPDATED', 'MESSAGE_DELETED', 'REACTION_ADDED', 'REACTION_REMOVED', 'POLL_VOTED', 'MESSAGE_TRANSCRIPTION_UPDATED', 'MESSAGE_READ_RECEIPT', 'MESSAGE_TRANSLATION_UPDATED', 'MESSAGES_READ_BATCH', 'MESSAGE_PINNED', 'MESSAGE_UNPINNED', 'MESSAGE_STATE_UPDATED', 'THREAD_LOCAL_INVALIDATE', 'CHAT_AUTO_TRANSLATE_CONFIG_UPDATED');

-- CreateEnum
CREATE TYPE "PollType" AS ENUM ('CLASSICAL', 'MULTI_ANSWER', 'QUIZ');

-- CreateEnum
CREATE TYPE "MarketItemTradeType" AS ENUM ('BUY_IT_NOW', 'SUGGESTED_PRICE', 'AUCTION', 'FREE');

-- CreateEnum
CREATE TYPE "MarketItemStatus" AS ENUM ('ACTIVE', 'SOLD', 'RESERVED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "AuctionType" AS ENUM ('RISING', 'HOLLAND');

-- CreateEnum
CREATE TYPE "BugStatus" AS ENUM ('CREATED', 'CONFIRMED', 'IN_PROGRESS', 'TEST', 'FINISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BugType" AS ENUM ('BUG', 'CRITICAL', 'SUGGESTION', 'QUESTION', 'TASK');

-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('ANNOUNCED', 'STARTED', 'FINISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ResultsStatus" AS ENUM ('NONE', 'IN_PROGRESS', 'FINAL');

-- CreateEnum
CREATE TYPE "WinnerOfGame" AS ENUM ('BY_MATCHES_WON', 'BY_POINTS', 'BY_SCORES_DELTA', 'PLAYOFF_FINALS');

-- CreateEnum
CREATE TYPE "WinnerOfMatch" AS ENUM ('BY_SETS', 'BY_SCORES');

-- CreateEnum
CREATE TYPE "MatchGenerationType" AS ENUM ('HANDMADE', 'AUTOMATIC', 'FIXED', 'RANDOM', 'ROUND_ROBIN', 'ESCALERA', 'RATING', 'WINNERS_COURT', 'KING_OF_COURT');

-- CreateEnum
CREATE TYPE "ScoringPreset" AS ENUM ('CLASSIC_BEST_OF_3', 'CLASSIC_BEST_OF_5', 'CLASSIC_PRO_SET', 'CLASSIC_SHORT_SET', 'CLASSIC_FAST4', 'CLASSIC_SUPER_TIEBREAK', 'CLASSIC_SINGLE_SET', 'CLASSIC_TIMED', 'POINTS_11', 'POINTS_12', 'POINTS_15', 'POINTS_16', 'POINTS_21', 'POINTS_24', 'POINTS_32', 'BEST_OF_3_11', 'BEST_OF_3_15', 'BEST_OF_3_21', 'BEST_OF_5_11', 'PAR_11', 'SINGLE_GAME_21', 'TIMED', 'CUSTOM');

-- CreateEnum
CREATE TYPE "BetType" AS ENUM ('SOCIAL', 'POOL');

-- CreateEnum
CREATE TYPE "BetPoolSide" AS ENUM ('WITH_CREATOR', 'AGAINST_CREATOR');

-- CreateEnum
CREATE TYPE "BetStatus" AS ENUM ('OPEN', 'ACCEPTED', 'RESOLVED', 'CANCELLED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('NEW_COIN', 'TRANSFER', 'PURCHASE', 'REFUND');

-- CreateEnum
CREATE TYPE "SportLevelSource" AS ENUM ('DEFAULT', 'QUESTIONNAIRE', 'MANUAL', 'PLAYTOMIC');

-- CreateEnum
CREATE TYPE "LevelChangeEventType" AS ENUM ('GAME', 'LUNDA', 'SET', 'QUESTIONNAIRE', 'OTHER', 'SOCIAL_BAR', 'SOCIAL_PARTICIPANT');

-- CreateEnum
CREATE TYPE "RoundType" AS ENUM ('REGULAR', 'PLAYOFF');

-- CreateEnum
CREATE TYPE "PlayoffFormat" AS ENUM ('SESSION', 'BRACKET');

-- CreateEnum
CREATE TYPE "BracketSlotKind" AS ENUM ('PLAY_IN', 'BYE', 'MAIN', 'THIRD_PLACE', 'CONSOLATION', 'LOSERS', 'GRAND_FINAL');

-- CreateEnum
CREATE TYPE "BracketScope" AS ENUM ('PER_GROUP', 'CROSS_GROUP');

-- CreateEnum
CREATE TYPE "LeagueParticipantType" AS ENUM ('USER', 'TEAM');

-- CreateEnum
CREATE TYPE "PriceType" AS ENUM ('PER_PERSON', 'PER_TEAM', 'TOTAL', 'NOT_KNOWN', 'FREE');

-- CreateEnum
CREATE TYPE "PriceCurrency" AS ENUM ('EUR', 'USD', 'GBP', 'JPY', 'CNY', 'CHF', 'CAD', 'AUD', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'RUB', 'RSD', 'TRY', 'INR', 'BRL', 'MXN', 'SGD', 'HKD', 'KRW', 'THB', 'MYR', 'IDR', 'PHP');

-- CreateEnum
CREATE TYPE "PushPlatform" AS ENUM ('IOS', 'ANDROID', 'WEB');

-- CreateEnum
CREATE TYPE "NotificationChannelType" AS ENUM ('PUSH', 'TELEGRAM', 'WHATSAPP', 'VIBER');

-- CreateEnum
CREATE TYPE "MessageReportReason" AS ENUM ('SPAM', 'HARASSMENT', 'INAPPROPRIATE_CONTENT', 'FAKE_INFORMATION', 'OTHER');

-- CreateEnum
CREATE TYPE "MessageReportStatus" AS ENUM ('PENDING', 'REVIEWED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "AdCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "AdPlacementKey" AS ENUM ('home_hero', 'find_top', 'leaderboard_banner');

-- CreateEnum
CREATE TYPE "AdClickAction" AS ENUM ('OPEN_URL', 'IN_APP_ROUTE', 'CLUB_PAGE', 'MARKET_ITEM');

-- CreateEnum
CREATE TYPE "AdEventType" AS ENUM ('IMPRESSION', 'CLICK', 'DISMISS');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "telegramId" TEXT,
    "telegramUsername" TEXT,
    "appleSub" TEXT,
    "appleEmail" TEXT,
    "appleEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "googleId" TEXT,
    "googleEmail" TEXT,
    "googleEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "firstName" TEXT,
    "lastName" TEXT,
    "avatar" TEXT,
    "originalAvatar" TEXT,
    "passwordHash" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "level" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "primarySport" "Sport" NOT NULL DEFAULT 'PADEL',
    "sportsEnabled" "Sport"[] DEFAULT ARRAY['PADEL']::"Sport"[],
    "lastCreatedSport" "Sport",
    "socialLevel" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "reliability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reliabilityDecayPostGraceDaysApplied" INTEGER NOT NULL DEFAULT 0,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "gamesWon" INTEGER NOT NULL DEFAULT 0,
    "wallet" INTEGER NOT NULL DEFAULT 0,
    "currentCityId" TEXT,
    "lastUserIP" TEXT,
    "latitudeByIP" DOUBLE PRECISION,
    "longitudeByIP" DOUBLE PRECISION,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'EUR',
    "language" TEXT DEFAULT 'auto',
    "translateToLanguage" VARCHAR(10),
    "timeFormat" TEXT NOT NULL DEFAULT 'auto',
    "weekStart" TEXT NOT NULL DEFAULT 'auto',
    "preferredHandLeft" BOOLEAN NOT NULL DEFAULT false,
    "preferredHandRight" BOOLEAN NOT NULL DEFAULT false,
    "preferredCourtSideLeft" BOOLEAN NOT NULL DEFAULT false,
    "preferredCourtSideRight" BOOLEAN NOT NULL DEFAULT false,
    "verbalStatus" VARCHAR(32),
    "bio" VARCHAR(128),
    "weeklyAvailability" JSONB,
    "availabilityBucketBoundaries" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isDeveloper" BOOLEAN NOT NULL DEFAULT false,
    "isTrainer" BOOLEAN NOT NULL DEFAULT false,
    "canCreateTournament" BOOLEAN NOT NULL DEFAULT false,
    "maxParticipantsInGame" INTEGER NOT NULL DEFAULT 12,
    "canCreateLeague" BOOLEAN NOT NULL DEFAULT false,
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "gender" "Gender" NOT NULL DEFAULT 'PREFER_NOT_TO_SAY',
    "genderIsSet" BOOLEAN NOT NULL DEFAULT false,
    "nameIsSet" BOOLEAN NOT NULL DEFAULT false,
    "primarySportIsSet" BOOLEAN NOT NULL DEFAULT false,
    "cityIsSet" BOOLEAN NOT NULL DEFAULT false,
    "welcomeScreenPassed" BOOLEAN NOT NULL DEFAULT false,
    "booktimeConnectHintDismissed" BOOLEAN NOT NULL DEFAULT false,
    "approvedLevel" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" TEXT,
    "approvedWhen" TIMESTAMP(3),
    "favoriteTrainerId" TEXT,
    "sendTelegramMessages" BOOLEAN NOT NULL DEFAULT true,
    "sendTelegramInvites" BOOLEAN NOT NULL DEFAULT true,
    "sendTelegramDirectMessages" BOOLEAN NOT NULL DEFAULT true,
    "sendTelegramReminders" BOOLEAN NOT NULL DEFAULT true,
    "sendTelegramWalletNotifications" BOOLEAN NOT NULL DEFAULT true,
    "sendPushMessages" BOOLEAN NOT NULL DEFAULT true,
    "sendPushInvites" BOOLEAN NOT NULL DEFAULT true,
    "sendPushDirectMessages" BOOLEAN NOT NULL DEFAULT true,
    "sendPushReminders" BOOLEAN NOT NULL DEFAULT true,
    "sendPushWalletNotifications" BOOLEAN NOT NULL DEFAULT true,
    "allowMessagesFromNonContacts" BOOLEAN NOT NULL DEFAULT true,
    "showOnlineStatus" BOOLEAN NOT NULL DEFAULT true,
    "shareGamePhotosToFollowers" BOOLEAN NOT NULL DEFAULT true,
    "shareGameCreationsToFollowers" BOOLEAN NOT NULL DEFAULT true,
    "shareGameResultsToFollowers" BOOLEAN NOT NULL DEFAULT true,
    "appIcon" TEXT DEFAULT 'tiger',
    "trainerRating" DOUBLE PRECISION,
    "trainerReviewCount" INTEGER NOT NULL DEFAULT 0,
    "reactionEmojiUsageVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_refresh_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceLabel" TEXT,
    "platform" TEXT NOT NULL DEFAULT 'unknown',
    "userAgent" TEXT,
    "deviceId" TEXT,
    "ip" VARCHAR(64),
    "revokedAt" TIMESTAMP(3),
    "replacedBySessionId" TEXT,
    "rotationFamilyId" TEXT NOT NULL,

    CONSTRAINT "user_refresh_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IpLocationCache" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "meta" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IpLocationCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LundaProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cookie" TEXT,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LundaProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "subAdministrativeArea" TEXT,
    "administrativeArea" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "clubsCount" INTEGER NOT NULL DEFAULT 0,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "telegramGroupId" TEXT,
    "telegramPinnedMessageId" TEXT,
    "telegramPinnedLanguage" TEXT NOT NULL DEFAULT 'en-GB',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Club" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "description" TEXT,
    "avatar" TEXT,
    "originalAvatar" TEXT,
    "photos" JSONB NOT NULL DEFAULT '[]',
    "address" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "openingTime" TEXT,
    "closingTime" TEXT,
    "amenities" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isBar" BOOLEAN NOT NULL DEFAULT false,
    "isForPlaying" BOOLEAN NOT NULL DEFAULT true,
    "integrationType" "ClubIntegrationType",
    "integrationConfig" JSONB,
    "pt_meta" JSONB,
    "courtsNumber" INTEGER NOT NULL DEFAULT 0,
    "sports" "Sport"[] DEFAULT ARRAY['PADEL']::"Sport"[],
    "clubRating" DOUBLE PRECISION,
    "clubReviewCount" INTEGER NOT NULL DEFAULT 0,
    "defaultSlotMinutes" INTEGER,
    "cancellationNoticeHours" INTEGER,
    "policyText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Club_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserClubBooktimeAuth" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "scoutOptIn" BOOLEAN NOT NULL DEFAULT true,
    "scoutInvalidAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserClubBooktimeAuth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubBooktimeBusySnapshot" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "courtId" TEXT,
    "externalCourtId" TEXT,
    "externalCourtName" TEXT,
    "date" TEXT NOT NULL,
    "busySlots" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubBooktimeBusySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSportProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sport" "Sport" NOT NULL,
    "level" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "reliability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "gamesWon" INTEGER NOT NULL DEFAULT 0,
    "questionnaireCompletedAt" TIMESTAMP(3),
    "questionnaireSkippedAt" TIMESTAMP(3),
    "questionnaireVersion" TEXT,
    "levelSource" "SportLevelSource" NOT NULL DEFAULT 'DEFAULT',
    "externalRatingHint" VARCHAR(32),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSportProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Court" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "sport" "Sport",
    "courtType" TEXT,
    "isIndoor" BOOLEAN NOT NULL DEFAULT false,
    "surfaceType" TEXT,
    "pricePerHour" DOUBLE PRECISION,
    "externalCourtId" TEXT,
    "integrationCourtName" TEXT,
    "webCameraUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Court_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubAdmin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "role" "ClubAdminRole" NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourtSlotHold" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "label" "CourtSlotHoldLabel" NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourtSlotHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "sport" "Sport" NOT NULL DEFAULT 'PADEL',
    "gameType" "GameType" NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "avatar" TEXT,
    "originalAvatar" TEXT,
    "clubId" TEXT,
    "courtId" TEXT,
    "cityId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "maxParticipants" INTEGER NOT NULL DEFAULT 4,
    "playersPerMatch" INTEGER NOT NULL DEFAULT 4,
    "minParticipants" INTEGER NOT NULL DEFAULT 2,
    "minLevel" DOUBLE PRECISION,
    "maxLevel" DOUBLE PRECISION,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "affectsRating" BOOLEAN NOT NULL DEFAULT true,
    "anyoneCanInvite" BOOLEAN NOT NULL DEFAULT false,
    "resultsByAnyone" BOOLEAN NOT NULL DEFAULT false,
    "allowDirectJoin" BOOLEAN NOT NULL DEFAULT false,
    "hasBookedCourt" BOOLEAN NOT NULL DEFAULT false,
    "afterGameGoToBar" BOOLEAN NOT NULL DEFAULT false,
    "hasFixedTeams" BOOLEAN NOT NULL DEFAULT false,
    "allowUserInMultipleTeams" BOOLEAN NOT NULL DEFAULT false,
    "genderTeams" "GenderTeam" NOT NULL DEFAULT 'ANY',
    "teamsReady" BOOLEAN NOT NULL DEFAULT false,
    "participantsReady" BOOLEAN NOT NULL DEFAULT false,
    "status" "GameStatus" NOT NULL DEFAULT 'ANNOUNCED',
    "resultsStatus" "ResultsStatus" NOT NULL DEFAULT 'NONE',
    "resultsMeta" JSONB,
    "fixedNumberOfSets" INTEGER NOT NULL DEFAULT 0,
    "maxTotalPointsPerSet" INTEGER NOT NULL DEFAULT 0,
    "matchTimedCapMinutes" INTEGER NOT NULL DEFAULT 0,
    "matchTimerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "maxPointsPerTeam" INTEGER NOT NULL DEFAULT 0,
    "winnerOfGame" "WinnerOfGame" NOT NULL DEFAULT 'BY_MATCHES_WON',
    "winnerOfMatch" "WinnerOfMatch" NOT NULL DEFAULT 'BY_SCORES',
    "matchGenerationType" "MatchGenerationType" NOT NULL DEFAULT 'HANDMADE',
    "pointsPerWin" INTEGER NOT NULL DEFAULT 0,
    "pointsPerLoose" INTEGER NOT NULL DEFAULT 0,
    "pointsPerTie" INTEGER NOT NULL DEFAULT 0,
    "ballsInGames" BOOLEAN NOT NULL DEFAULT false,
    "scoringPreset" "ScoringPreset",
    "scoringMode" TEXT,
    "hasGoldenPoint" BOOLEAN NOT NULL DEFAULT false,
    "mediaUrls" TEXT[],
    "photosCount" INTEGER NOT NULL DEFAULT 0,
    "mainPhotoId" TEXT,
    "resultsSentToTelegram" BOOLEAN NOT NULL DEFAULT false,
    "telegramResultsSummary" TEXT,
    "resultsSummaryText" TEXT,
    "resultsSummaryGeneratedAt" TIMESTAMP(3),
    "resultsArtifactsReadyAt" TIMESTAMP(3),
    "resultsArtifactsVersion" INTEGER NOT NULL DEFAULT 0,
    "parentId" TEXT,
    "trainerId" TEXT,
    "leagueRoundId" TEXT,
    "leagueGroupId" TEXT,
    "timeIsSet" BOOLEAN NOT NULL DEFAULT false,
    "finishedDate" TIMESTAMP(3),
    "priceTotal" DOUBLE PRECISION,
    "priceType" "PriceType" NOT NULL DEFAULT 'NOT_KNOWN',
    "priceCurrency" "PriceCurrency",
    "timeOverride" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "lastMessagePreview" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameExternalBooking" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "externalBookingId" TEXT NOT NULL,
    "externalBookingProvider" "ClubIntegrationType" NOT NULL DEFAULT 'BOOKTIME',
    "courtId" TEXT,
    "bookingStart" TIMESTAMP(3),
    "bookingEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameExternalBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GamePhoto" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "uploaderId" TEXT,
    "source" "GamePhotoSource" NOT NULL DEFAULT 'USER',
    "originalUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "thumbWidth" INTEGER,
    "thumbHeight" INTEGER,
    "byteSize" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "clientUploadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "GamePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameReaction" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserStory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserStory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserStoryItem" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "mediaUrl" TEXT NOT NULL,
    "thumbnailUrl" TEXT NOT NULL,
    "posterUrl" TEXT,
    "messageType" "MessageType" NOT NULL,
    "videoDurationMs" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "overlayText" TEXT,
    "overlayStyle" JSONB,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "clientUploadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "UserStoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryView" (
    "id" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "sourceType" "StorySourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorySegmentLike" (
    "id" TEXT NOT NULL,
    "sourceType" "StorySourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorySegmentLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorySegmentComment" (
    "id" TEXT NOT NULL,
    "sourceType" "StorySourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "parentId" TEXT,
    "body" TEXT NOT NULL,
    "clientMutationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "StorySegmentComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryCommentLike" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryCommentLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryCommentReport" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" "MessageReportReason" NOT NULL,
    "description" TEXT,
    "status" "MessageReportStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryCommentReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserReactionEmojiStat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserReactionEmojiStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CancelledGame" (
    "id" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "name" TEXT,
    "sport" "Sport" NOT NULL DEFAULT 'PADEL',
    "cancelledByUserId" TEXT NOT NULL,
    "cancelledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cityId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CancelledGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameFaq" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameFaq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerReview" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "text" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainerReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubReview" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "text" VARCHAR(1000),
    "photos" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameParticipant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "role" "ParticipantRole" NOT NULL,
    "status" "ParticipantStatus" NOT NULL DEFAULT 'PLAYING',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stats" JSONB,
    "invitedByUserId" TEXT,
    "inviteMessage" TEXT,
    "inviteExpiresAt" TIMESTAMP(3),
    "inviteUserTeamId" TEXT,
    "inviteClosedAt" TIMESTAMP(3),
    "activeMatchId" TEXT,

    CONSTRAINT "GameParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameInviteOutcome" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "outcome" "GameInviteOutcomeType" NOT NULL,
    "invitedByUserId" TEXT,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameInviteOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Round" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "matchNumber" INTEGER NOT NULL,
    "winnerId" TEXT,
    "courtId" TEXT,
    "metadata" JSONB,
    "timerStatus" "MatchTimerStatus" NOT NULL DEFAULT 'IDLE',
    "timerStartedAt" TIMESTAMP(3),
    "timerPausedAt" TIMESTAMP(3),
    "timerElapsedMs" INTEGER NOT NULL DEFAULT 0,
    "timerCapMinutes" INTEGER,
    "timerExpiryNotifiedAt" TIMESTAMP(3),
    "timerUpdatedBy" TEXT,
    "timerUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchLiveScoringAudit" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "userId" TEXT,
    "revisionBefore" INTEGER,
    "revisionAfter" INTEGER,
    "clientMessageId" TEXT,
    "opId" TEXT,
    "reasonCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchLiveScoringAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "teamNumber" INTEGER NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamPlayer" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Set" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "setNumber" INTEGER NOT NULL,
    "teamAScore" INTEGER NOT NULL DEFAULT 0,
    "teamBScore" INTEGER NOT NULL DEFAULT 0,
    "isTieBreak" BOOLEAN NOT NULL DEFAULT false,
    "role" "MatchSetRole" NOT NULL DEFAULT 'OFFICIAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Set_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoundOutcome" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "levelChange" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoundOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameWorkoutSummary" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "WorkoutSessionSource" NOT NULL DEFAULT 'APPLE_WATCH',
    "durationSeconds" INTEGER NOT NULL,
    "totalEnergyKcal" DOUBLE PRECISION,
    "avgHeartRate" DOUBLE PRECISION,
    "maxHeartRate" DOUBLE PRECISION,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "healthExternalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameWorkoutSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameOutcome" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "levelBefore" DOUBLE PRECISION NOT NULL,
    "levelAfter" DOUBLE PRECISION NOT NULL,
    "levelChange" DOUBLE PRECISION NOT NULL,
    "reliabilityBefore" DOUBLE PRECISION NOT NULL,
    "reliabilityAfter" DOUBLE PRECISION NOT NULL,
    "reliabilityChange" DOUBLE PRECISION NOT NULL,
    "pointsEarned" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER,
    "isWinner" BOOLEAN NOT NULL DEFAULT false,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "ties" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "scoresMade" INTEGER NOT NULL DEFAULT 0,
    "scoresLost" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameTeam" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "teamNumber" INTEGER NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameTeamPlayer" (
    "id" TEXT NOT NULL,
    "gameTeamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameTeamPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserInteraction" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "lastInteractionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserChat" (
    "id" TEXT NOT NULL,
    "user1Id" TEXT NOT NULL,
    "user2Id" TEXT NOT NULL,
    "user1allowed" BOOLEAN NOT NULL DEFAULT true,
    "user2allowed" BOOLEAN NOT NULL DEFAULT true,
    "lastMessagePreview" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PinnedUserChat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userChatId" TEXT NOT NULL,
    "pinnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PinnedUserChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "chatContextType" "ChatContextType" NOT NULL DEFAULT 'GAME',
    "contextId" TEXT NOT NULL,
    "gameId" TEXT,
    "senderId" TEXT,
    "content" TEXT,
    "contentSearchable" TEXT,
    "mediaUrls" TEXT[],
    "thumbnailUrls" TEXT[],
    "mentionIds" TEXT[],
    "state" "MessageState" NOT NULL DEFAULT 'SENT',
    "chatType" "ChatType" NOT NULL DEFAULT 'PUBLIC',
    "messageType" "MessageType" NOT NULL DEFAULT 'TEXT',
    "audioDurationMs" INTEGER,
    "videoDurationMs" INTEGER,
    "videoWidth" INTEGER,
    "videoHeight" INTEGER,
    "waveformData" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "clientMutationId" TEXT,
    "serverSyncSeq" INTEGER,
    "replyToId" TEXT,
    "storyReply" JSONB,
    "pollId" TEXT,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PinnedMessage" (
    "id" TEXT NOT NULL,
    "chatContextType" "ChatContextType" NOT NULL,
    "contextId" TEXT NOT NULL,
    "chatType" "ChatType" NOT NULL DEFAULT 'PUBLIC',
    "messageId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "pinnedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PinnedMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Poll" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "type" "PollType" NOT NULL DEFAULT 'CLASSICAL',
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "allowsMultipleAnswers" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "messageId" TEXT NOT NULL,

    CONSTRAINT "Poll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollOption" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "pollId" TEXT NOT NULL,

    CONSTRAINT "PollOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollVote" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMute" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chatContextType" "ChatContextType" NOT NULL,
    "contextId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatMute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatTranslationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chatContextType" "ChatContextType" NOT NULL,
    "contextId" TEXT NOT NULL,
    "translateToLanguage" VARCHAR(10),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatTranslationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatAutoTranslateConfig" (
    "id" TEXT NOT NULL,
    "chatContextType" "ChatContextType" NOT NULL,
    "contextId" TEXT NOT NULL,
    "chatTypeKey" VARCHAR(16) NOT NULL DEFAULT '',
    "languageCodes" TEXT[],
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatAutoTranslateConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResultsArtifactSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "replicatePhotoModel" TEXT NOT NULL DEFAULT 'black-forest-labs/flux-2-max',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResultsArtifactSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameResultsArtifactJob" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "status" "GameResultsArtifactJobStatus" NOT NULL DEFAULT 'pending',
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "generationVersion" INTEGER NOT NULL DEFAULT 1,
    "summaryStatus" "GameResultsArtifactStepStatus" NOT NULL DEFAULT 'pending',
    "summaryError" TEXT,
    "photoStatus" "GameResultsArtifactStepStatus" NOT NULL DEFAULT 'pending',
    "photoError" TEXT,
    "replicatePredictionId" TEXT,
    "replicatePhotoModel" TEXT,
    "userPhotoCountAtEnqueue" INTEGER NOT NULL DEFAULT 0,
    "mainPhotoIdAtEnqueue" TEXT,
    "hadUserPhotosAtEnqueue" BOOLEAN NOT NULL DEFAULT false,
    "photoGenerationsUsed" INTEGER NOT NULL DEFAULT 0,
    "languageCode" VARCHAR(10) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameResultsArtifactJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TranslationJob" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "languageCode" VARCHAR(10) NOT NULL,
    "priority" "TranslationJobPriority" NOT NULL DEFAULT 'normal',
    "status" "TranslationJobStatus" NOT NULL DEFAULT 'pending',
    "source" "TranslationJobSource" NOT NULL DEFAULT 'auto',
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranslationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chatContextType" "ChatContextType" NOT NULL,
    "contextId" TEXT NOT NULL,
    "chatType" "ChatType" NOT NULL DEFAULT 'PUBLIC',
    "content" TEXT,
    "mentionIds" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMutationIdempotency" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientMutationId" VARCHAR(128) NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "messageId" VARCHAR(40) NOT NULL,
    "payloadHash" VARCHAR(64),
    "responseJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMutationIdempotency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatReadCursor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chatContextType" "ChatContextType" NOT NULL,
    "contextId" TEXT NOT NULL,
    "chatType" "ChatType" NOT NULL DEFAULT 'PUBLIC',
    "readMaxServerSyncSeq" INTEGER NOT NULL DEFAULT -1,
    "readMaxCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00 +00:00',
    "readMaxMessageId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatReadCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageReaction" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageReadReceipt" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageReadReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTranslation" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "languageCode" VARCHAR(10) NOT NULL,
    "translation" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTranscription" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "transcription" TEXT NOT NULL,
    "languageCode" VARCHAR(16),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageTranscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFavoriteClub" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserFavoriteClub_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFavoriteUser" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "favoriteUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserFavoriteUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockedUser" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "blockedUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockedUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTeam" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "verbalStatus" VARCHAR(32),
    "avatar" TEXT,
    "originalAvatar" TEXT,
    "cutAngle" DOUBLE PRECISION NOT NULL DEFAULT 45,
    "ownerId" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "UserTeamMemberStatus" NOT NULL DEFAULT 'PENDING',
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationSyncState" (
    "contextType" "ChatContextType" NOT NULL,
    "contextId" TEXT NOT NULL,
    "maxSeq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ConversationSyncState_pkey" PRIMARY KEY ("contextType","contextId")
);

-- CreateTable
CREATE TABLE "ChatSyncEvent" (
    "id" TEXT NOT NULL,
    "contextType" "ChatContextType" NOT NULL,
    "contextId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "eventType" "ChatSyncEventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatSyncEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramOtp" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(6) NOT NULL,
    "telegramId" VARCHAR(255) NOT NULL,
    "username" VARCHAR(255),
    "firstName" VARCHAR(255),
    "lastName" VARCHAR(255),
    "languageCode" VARCHAR(10),
    "chatId" VARCHAR(255),
    "textMessageId" VARCHAR(255),
    "codeMessageId" VARCHAR(255),
    "linkKey" VARCHAR(64),
    "linkMessageId" VARCHAR(255),
    "linkUserId" VARCHAR(255),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramOtp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramAccountLinkIntent" (
    "id" TEXT NOT NULL,
    "token" VARCHAR(32) NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramAccountLinkIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bug" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "status" "BugStatus" NOT NULL DEFAULT 'CREATED',
    "bugType" "BugType" NOT NULL DEFAULT 'BUG',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "lastMessagePreview" VARCHAR(500),
    "finishedAt" TIMESTAMP(3),
    "testingStartedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bug_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BugParticipant" (
    "id" TEXT NOT NULL,
    "bugId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BugParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketItemCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sport" "Sport",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketItemCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketItem" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "additionalCityIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "title" TEXT NOT NULL,
    "description" TEXT,
    "mediaUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tradeTypes" "MarketItemTradeType"[] DEFAULT ARRAY[]::"MarketItemTradeType"[],
    "negotiationAcceptable" BOOLEAN DEFAULT false,
    "priceCents" INTEGER,
    "currency" "PriceCurrency" NOT NULL DEFAULT 'EUR',
    "auctionEndsAt" TIMESTAMP(3),
    "auctionType" "AuctionType",
    "startingPriceCents" INTEGER,
    "reservePriceCents" INTEGER,
    "buyItNowPriceCents" INTEGER,
    "currentPriceCents" INTEGER,
    "hollandDecrementCents" INTEGER,
    "hollandIntervalMinutes" INTEGER,
    "winnerId" TEXT,
    "status" "MarketItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketItemBid" (
    "id" TEXT NOT NULL,
    "marketItemId" TEXT NOT NULL,
    "bidderId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "outbidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketItemBid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupChannel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar" TEXT,
    "originalAvatar" TEXT,
    "cityId" TEXT,
    "bugId" TEXT,
    "marketItemId" TEXT,
    "buyerId" TEXT,
    "isChannel" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "isCityGroup" BOOLEAN NOT NULL DEFAULT false,
    "participantsCount" INTEGER NOT NULL DEFAULT 0,
    "lastMessagePreview" VARCHAR(500),
    "lastMessageSenderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PinnedGroupChannel" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupChannelId" TEXT NOT NULL,
    "pinnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PinnedGroupChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupChannelParticipant" (
    "id" TEXT NOT NULL,
    "groupChannelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ParticipantRole" NOT NULL DEFAULT 'PARTICIPANT',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hidden" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "GroupChannelParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupChannelInvite" (
    "id" TEXT NOT NULL,
    "groupChannelId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupChannelInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameCourt" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameCourt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goods" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "total" INTEGER NOT NULL,
    "fromUserId" TEXT,
    "toUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionRow" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "goodsId" TEXT,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LevelChangeEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "levelBefore" DOUBLE PRECISION NOT NULL,
    "levelAfter" DOUBLE PRECISION NOT NULL,
    "eventType" "LevelChangeEventType" NOT NULL,
    "sport" "Sport",
    "gameId" TEXT,
    "linkEntityType" "EntityType",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LevelChangeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "League" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "hasFixedTeams" BOOLEAN NOT NULL DEFAULT false,
    "cityId" TEXT NOT NULL,
    "clubId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "League_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueSeason" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "sport" "Sport" NOT NULL DEFAULT 'PADEL',
    "movePlayersRule" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeagueSeason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueGroup" (
    "id" TEXT NOT NULL,
    "leagueSeasonId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "betterGroupId" TEXT,
    "worseGroupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeagueGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueTeam" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeagueTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueTeamPlayer" (
    "id" TEXT NOT NULL,
    "leagueTeamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeagueTeamPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueParticipant" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "leagueSeasonId" TEXT NOT NULL,
    "participantType" "LeagueParticipantType" NOT NULL,
    "userId" TEXT,
    "leagueTeamId" TEXT,
    "currentGroupId" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "ties" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "scoreDelta" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeagueParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueRound" (
    "id" TEXT NOT NULL,
    "leagueSeasonId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "roundType" "RoundType" NOT NULL DEFAULT 'REGULAR',
    "playoffFormat" "PlayoffFormat",
    "bracketScope" "BracketScope" NOT NULL DEFAULT 'PER_GROUP',
    "entrantCount" INTEGER,
    "bracketSize" INTEGER,
    "byeCount" INTEGER,
    "bracketTemplateVersion" INTEGER,
    "bracketConfig" JSONB,
    "sentStartMessage" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeagueRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueBracketSlot" (
    "id" TEXT NOT NULL,
    "leagueRoundId" TEXT NOT NULL,
    "leagueGroupId" TEXT,
    "slotKey" TEXT NOT NULL,
    "slotKind" "BracketSlotKind" NOT NULL,
    "phaseIndex" INTEGER NOT NULL,
    "roundIndex" INTEGER NOT NULL,
    "matchIndex" INTEGER NOT NULL,
    "leagueParticipantId" TEXT,
    "gameId" TEXT,
    "winnerSlotId" TEXT,
    "feederSlotAId" TEXT,
    "feederSlotBId" TEXT,
    "seedRank" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeagueBracketSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "PushPlatform" NOT NULL,
    "deviceId" TEXT,
    "appVersion" TEXT,
    "appBuild" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeletedUser" (
    "id" TEXT NOT NULL,
    "originalUserId" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "telegramId" TEXT,
    "telegramUsername" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "avatar" TEXT,
    "originalAvatar" TEXT,
    "passwordHash" TEXT,
    "currentCityId" TEXT,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeletedUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelType" "NotificationChannelType" NOT NULL,
    "sendMessages" BOOLEAN NOT NULL DEFAULT true,
    "sendInvites" BOOLEAN NOT NULL DEFAULT true,
    "sendDirectMessages" BOOLEAN NOT NULL DEFAULT true,
    "sendReminders" BOOLEAN NOT NULL DEFAULT true,
    "sendWalletNotifications" BOOLEAN NOT NULL DEFAULT true,
    "sendMarketplaceNotifications" BOOLEAN NOT NULL DEFAULT true,
    "sendTeamNotifications" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageReport" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" "MessageReportReason" NOT NULL,
    "description" TEXT,
    "status" "MessageReportStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "clubIds" TEXT[],
    "entityTypes" "EntityType"[],
    "dayOfWeek" INTEGER[],
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "startTime" TEXT,
    "endTime" TEXT,
    "minLevel" DOUBLE PRECISION,
    "maxLevel" DOUBLE PRECISION,
    "myGenderOnly" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bet" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "type" "BetType" NOT NULL DEFAULT 'SOCIAL',
    "status" "BetStatus" NOT NULL DEFAULT 'OPEN',
    "condition" JSONB NOT NULL,
    "stakeType" TEXT NOT NULL DEFAULT 'COINS',
    "stakeCoins" INTEGER,
    "stakeText" TEXT,
    "rewardType" TEXT NOT NULL DEFAULT 'COINS',
    "rewardCoins" INTEGER,
    "rewardText" TEXT,
    "poolTotalCoins" INTEGER,
    "acceptedBy" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "winnerId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BetParticipant" (
    "id" TEXT NOT NULL,
    "betId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "side" "BetPoolSide" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BetParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppVersionRequirement" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "minBuildNumber" INTEGER NOT NULL,
    "minVersion" TEXT NOT NULL,
    "isBlocking" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppVersionRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserGameNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserGameNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "baseCurrency" "PriceCurrency" NOT NULL,
    "targetCurrency" "PriceCurrency" NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fetchedFromAPI" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LlmUsageLog" (
    "id" TEXT NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "model" VARCHAR(128) NOT NULL,
    "reason" VARCHAR(64),
    "userId" TEXT,
    "input" TEXT NOT NULL,
    "output" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdSponsor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactEmail" TEXT,
    "notes" TEXT,
    "clubId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdSponsor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCampaign" (
    "id" TEXT NOT NULL,
    "sponsorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AdCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "weight" INTEGER NOT NULL DEFAULT 100,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "defaultLocale" TEXT NOT NULL DEFAULT 'en',
    "frequencyCap" JSONB,
    "dismissible" BOOLEAN NOT NULL DEFAULT true,
    "dismissSnoozeDays" INTEGER,
    "clickUrlTrusted" BOOLEAN NOT NULL DEFAULT true,
    "disclosureLabel" TEXT,
    "hideDisclosure" BOOLEAN NOT NULL DEFAULT false,
    "targeting" JSONB NOT NULL,
    "testUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCreative" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "placement" "AdPlacementKey",
    "locale" TEXT NOT NULL,
    "variantKey" TEXT NOT NULL DEFAULT 'A',
    "imageUrl" TEXT NOT NULL,
    "imageUrlDark" TEXT,
    "title" TEXT,
    "subtitle" TEXT,
    "ctaLabel" TEXT,
    "clickUrl" TEXT NOT NULL,
    "clickAction" "AdClickAction" NOT NULL DEFAULT 'OPEN_URL',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdCreative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdCampaignPlacement" (
    "campaignId" TEXT NOT NULL,
    "placement" "AdPlacementKey" NOT NULL,

    CONSTRAINT "AdCampaignPlacement_pkey" PRIMARY KEY ("campaignId","placement")
);

-- CreateTable
CREATE TABLE "AdEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" "AdEventType" NOT NULL,
    "campaignId" TEXT NOT NULL,
    "creativeId" TEXT NOT NULL,
    "placement" "AdPlacementKey" NOT NULL,
    "userId" TEXT,
    "adSessionId" TEXT,
    "platform" TEXT,
    "cityId" TEXT,
    "sport" "Sport",
    "locale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdUserState" (
    "userId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "capWindowStart" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "snoozedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdUserState_pkey" PRIMARY KEY ("userId","campaignId")
);

-- CreateTable
CREATE TABLE "AdSessionPick" (
    "adSessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "placement" "AdPlacementKey" NOT NULL,
    "contextKey" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "creativeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AdCampaignDailyStats" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "sponsorId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "placement" "AdPlacementKey" NOT NULL,
    "cityId" TEXT,
    "locale" TEXT,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "uniqueUsers" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "dismisses" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AdCampaignDailyStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdTargetingPreset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "targeting" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdTargetingPreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "User_appleSub_key" ON "User"("appleSub");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE INDEX "User_phone_idx" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_telegramId_idx" ON "User"("telegramId");

-- CreateIndex
CREATE INDEX "User_currentCityId_idx" ON "User"("currentCityId");

-- CreateIndex
CREATE INDEX "User_level_idx" ON "User"("level");

-- CreateIndex
CREATE INDEX "User_totalPoints_idx" ON "User"("totalPoints");

-- CreateIndex
CREATE INDEX "User_approvedById_idx" ON "User"("approvedById");

-- CreateIndex
CREATE UNIQUE INDEX "user_refresh_sessions_tokenHash_key" ON "user_refresh_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "user_refresh_sessions_userId_revokedAt_idx" ON "user_refresh_sessions"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "user_refresh_sessions_rotationFamilyId_idx" ON "user_refresh_sessions"("rotationFamilyId");

-- CreateIndex
CREATE UNIQUE INDEX "IpLocationCache_ip_key" ON "IpLocationCache"("ip");

-- CreateIndex
CREATE INDEX "IpLocationCache_ip_idx" ON "IpLocationCache"("ip");

-- CreateIndex
CREATE UNIQUE INDEX "LundaProfile_userId_key" ON "LundaProfile"("userId");

-- CreateIndex
CREATE INDEX "City_isActive_idx" ON "City"("isActive");

-- CreateIndex
CREATE INDEX "City_clubsCount_idx" ON "City"("clubsCount");

-- CreateIndex
CREATE INDEX "Club_cityId_idx" ON "Club"("cityId");

-- CreateIndex
CREATE INDEX "Club_isActive_idx" ON "Club"("isActive");

-- CreateIndex
CREATE INDEX "Club_integrationType_idx" ON "Club"("integrationType");

-- CreateIndex
CREATE INDEX "Club_normalizedName_idx" ON "Club"("normalizedName");

-- CreateIndex
CREATE INDEX "UserClubBooktimeAuth_clubId_scoutOptIn_idx" ON "UserClubBooktimeAuth"("clubId", "scoutOptIn");

-- CreateIndex
CREATE UNIQUE INDEX "UserClubBooktimeAuth_userId_clubId_key" ON "UserClubBooktimeAuth"("userId", "clubId");

-- CreateIndex
CREATE INDEX "ClubBooktimeBusySnapshot_clubId_date_idx" ON "ClubBooktimeBusySnapshot"("clubId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ClubBooktimeBusySnapshot_clubId_courtId_date_key" ON "ClubBooktimeBusySnapshot"("clubId", "courtId", "date");

-- CreateIndex
CREATE INDEX "UserSportProfile_userId_idx" ON "UserSportProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSportProfile_userId_sport_key" ON "UserSportProfile"("userId", "sport");

-- CreateIndex
CREATE INDEX "Court_clubId_idx" ON "Court"("clubId");

-- CreateIndex
CREATE INDEX "Court_isActive_idx" ON "Court"("isActive");

-- CreateIndex
CREATE INDEX "Court_externalCourtId_idx" ON "Court"("externalCourtId");

-- CreateIndex
CREATE INDEX "ClubAdmin_clubId_idx" ON "ClubAdmin"("clubId");

-- CreateIndex
CREATE INDEX "ClubAdmin_userId_idx" ON "ClubAdmin"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubAdmin_userId_clubId_key" ON "ClubAdmin"("userId", "clubId");

-- CreateIndex
CREATE INDEX "CourtSlotHold_clubId_startTime_endTime_idx" ON "CourtSlotHold"("clubId", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "CourtSlotHold_courtId_startTime_idx" ON "CourtSlotHold"("courtId", "startTime");

-- CreateIndex
CREATE UNIQUE INDEX "Game_mainPhotoId_key" ON "Game"("mainPhotoId");

-- CreateIndex
CREATE INDEX "Game_clubId_idx" ON "Game"("clubId");

-- CreateIndex
CREATE INDEX "Game_courtId_idx" ON "Game"("courtId");

-- CreateIndex
CREATE INDEX "Game_cityId_idx" ON "Game"("cityId");

-- CreateIndex
CREATE INDEX "Game_startTime_idx" ON "Game"("startTime");

-- CreateIndex
CREATE INDEX "Game_status_idx" ON "Game"("status");

-- CreateIndex
CREATE INDEX "Game_entityType_idx" ON "Game"("entityType");

-- CreateIndex
CREATE INDEX "Game_parentId_idx" ON "Game"("parentId");

-- CreateIndex
CREATE INDEX "Game_trainerId_idx" ON "Game"("trainerId");

-- CreateIndex
CREATE INDEX "Game_leagueRoundId_idx" ON "Game"("leagueRoundId");

-- CreateIndex
CREATE INDEX "Game_leagueGroupId_idx" ON "Game"("leagueGroupId");

-- CreateIndex
CREATE INDEX "Game_affectsRating_idx" ON "Game"("affectsRating");

-- CreateIndex
CREATE INDEX "Game_resultsStatus_idx" ON "Game"("resultsStatus");

-- CreateIndex
CREATE INDEX "Game_hasFixedTeams_idx" ON "Game"("hasFixedTeams");

-- CreateIndex
CREATE INDEX "Game_timeIsSet_clubId_startTime_idx" ON "Game"("timeIsSet", "clubId", "startTime");

-- CreateIndex
CREATE INDEX "Game_endTime_idx" ON "Game"("endTime");

-- CreateIndex
CREATE INDEX "Game_timeIsSet_courtId_idx" ON "Game"("timeIsSet", "courtId");

-- CreateIndex
CREATE INDEX "Game_mainPhotoId_idx" ON "Game"("mainPhotoId");

-- CreateIndex
CREATE INDEX "GameExternalBooking_externalBookingId_idx" ON "GameExternalBooking"("externalBookingId");

-- CreateIndex
CREATE INDEX "GameExternalBooking_gameId_idx" ON "GameExternalBooking"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "GameExternalBooking_gameId_externalBookingId_key" ON "GameExternalBooking"("gameId", "externalBookingId");

-- CreateIndex
CREATE INDEX "GamePhoto_gameId_deletedAt_createdAt_idx" ON "GamePhoto"("gameId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "GamePhoto_uploaderId_idx" ON "GamePhoto"("uploaderId");

-- CreateIndex
CREATE UNIQUE INDEX "GamePhoto_uploaderId_clientUploadId_key" ON "GamePhoto"("uploaderId", "clientUploadId");

-- CreateIndex
CREATE INDEX "GameReaction_gameId_idx" ON "GameReaction"("gameId");

-- CreateIndex
CREATE INDEX "GameReaction_userId_idx" ON "GameReaction"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GameReaction_gameId_userId_key" ON "GameReaction"("gameId", "userId");

-- CreateIndex
CREATE INDEX "UserStory_userId_expiresAt_idx" ON "UserStory"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "UserStoryItem_storyId_sortOrder_idx" ON "UserStoryItem"("storyId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "UserStoryItem_storyId_clientUploadId_key" ON "UserStoryItem"("storyId", "clientUploadId");

-- CreateIndex
CREATE INDEX "StoryView_viewerId_ownerUserId_idx" ON "StoryView"("viewerId", "ownerUserId");

-- CreateIndex
CREATE INDEX "StoryView_ownerUserId_sourceId_idx" ON "StoryView"("ownerUserId", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "StoryView_viewerId_sourceType_sourceId_key" ON "StoryView"("viewerId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "StorySegmentLike_sourceType_sourceId_idx" ON "StorySegmentLike"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "StorySegmentLike_sourceType_sourceId_userId_key" ON "StorySegmentLike"("sourceType", "sourceId", "userId");

-- CreateIndex
CREATE INDEX "StorySegmentComment_sourceType_sourceId_createdAt_idx" ON "StorySegmentComment"("sourceType", "sourceId", "createdAt");

-- CreateIndex
CREATE INDEX "StorySegmentComment_parentId_idx" ON "StorySegmentComment"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "StorySegmentComment_authorId_clientMutationId_key" ON "StorySegmentComment"("authorId", "clientMutationId");

-- CreateIndex
CREATE UNIQUE INDEX "StoryCommentLike_commentId_userId_key" ON "StoryCommentLike"("commentId", "userId");

-- CreateIndex
CREATE INDEX "StoryCommentReport_commentId_idx" ON "StoryCommentReport"("commentId");

-- CreateIndex
CREATE INDEX "StoryCommentReport_reporterId_idx" ON "StoryCommentReport"("reporterId");

-- CreateIndex
CREATE INDEX "StoryCommentReport_status_idx" ON "StoryCommentReport"("status");

-- CreateIndex
CREATE INDEX "StoryCommentReport_createdAt_idx" ON "StoryCommentReport"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoryCommentReport_commentId_reporterId_key" ON "StoryCommentReport"("commentId", "reporterId");

-- CreateIndex
CREATE INDEX "UserReactionEmojiStat_userId_count_lastUsedAt_idx" ON "UserReactionEmojiStat"("userId", "count" DESC, "lastUsedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "UserReactionEmojiStat_userId_emoji_key" ON "UserReactionEmojiStat"("userId", "emoji");

-- CreateIndex
CREATE INDEX "CancelledGame_cityId_idx" ON "CancelledGame"("cityId");

-- CreateIndex
CREATE INDEX "GameFaq_gameId_idx" ON "GameFaq"("gameId");

-- CreateIndex
CREATE INDEX "GameFaq_order_idx" ON "GameFaq"("order");

-- CreateIndex
CREATE INDEX "TrainerReview_trainerId_idx" ON "TrainerReview"("trainerId");

-- CreateIndex
CREATE INDEX "TrainerReview_gameId_idx" ON "TrainerReview"("gameId");

-- CreateIndex
CREATE INDEX "TrainerReview_reviewerId_idx" ON "TrainerReview"("reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainerReview_trainerId_reviewerId_gameId_key" ON "TrainerReview"("trainerId", "reviewerId", "gameId");

-- CreateIndex
CREATE INDEX "ClubReview_clubId_idx" ON "ClubReview"("clubId");

-- CreateIndex
CREATE INDEX "ClubReview_gameId_idx" ON "ClubReview"("gameId");

-- CreateIndex
CREATE INDEX "ClubReview_reviewerId_idx" ON "ClubReview"("reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubReview_reviewerId_gameId_key" ON "ClubReview"("reviewerId", "gameId");

-- CreateIndex
CREATE INDEX "GameParticipant_userId_idx" ON "GameParticipant"("userId");

-- CreateIndex
CREATE INDEX "GameParticipant_gameId_idx" ON "GameParticipant"("gameId");

-- CreateIndex
CREATE INDEX "GameParticipant_role_idx" ON "GameParticipant"("role");

-- CreateIndex
CREATE INDEX "GameParticipant_status_idx" ON "GameParticipant"("status");

-- CreateIndex
CREATE INDEX "GameParticipant_activeMatchId_idx" ON "GameParticipant"("activeMatchId");

-- CreateIndex
CREATE INDEX "GameParticipant_inviteUserTeamId_idx" ON "GameParticipant"("inviteUserTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "GameParticipant_userId_gameId_key" ON "GameParticipant"("userId", "gameId");

-- CreateIndex
CREATE INDEX "GameInviteOutcome_gameId_idx" ON "GameInviteOutcome"("gameId");

-- CreateIndex
CREATE INDEX "GameInviteOutcome_userId_idx" ON "GameInviteOutcome"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GameInviteOutcome_gameId_userId_key" ON "GameInviteOutcome"("gameId", "userId");

-- CreateIndex
CREATE INDEX "Round_gameId_idx" ON "Round"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "Round_gameId_roundNumber_key" ON "Round"("gameId", "roundNumber");

-- CreateIndex
CREATE INDEX "Match_roundId_idx" ON "Match"("roundId");

-- CreateIndex
CREATE INDEX "Match_winnerId_idx" ON "Match"("winnerId");

-- CreateIndex
CREATE INDEX "Match_courtId_idx" ON "Match"("courtId");

-- CreateIndex
CREATE INDEX "Match_timerStatus_idx" ON "Match"("timerStatus");

-- CreateIndex
CREATE INDEX "MatchLiveScoringAudit_matchId_createdAt_idx" ON "MatchLiveScoringAudit"("matchId", "createdAt");

-- CreateIndex
CREATE INDEX "MatchLiveScoringAudit_gameId_createdAt_idx" ON "MatchLiveScoringAudit"("gameId", "createdAt");

-- CreateIndex
CREATE INDEX "Team_matchId_idx" ON "Team"("matchId");

-- CreateIndex
CREATE INDEX "TeamPlayer_teamId_idx" ON "TeamPlayer"("teamId");

-- CreateIndex
CREATE INDEX "TeamPlayer_userId_idx" ON "TeamPlayer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamPlayer_teamId_userId_key" ON "TeamPlayer"("teamId", "userId");

-- CreateIndex
CREATE INDEX "Set_matchId_idx" ON "Set"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "Set_matchId_setNumber_key" ON "Set"("matchId", "setNumber");

-- CreateIndex
CREATE INDEX "RoundOutcome_roundId_idx" ON "RoundOutcome"("roundId");

-- CreateIndex
CREATE INDEX "RoundOutcome_userId_idx" ON "RoundOutcome"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RoundOutcome_roundId_userId_key" ON "RoundOutcome"("roundId", "userId");

-- CreateIndex
CREATE INDEX "GameWorkoutSummary_userId_endedAt_idx" ON "GameWorkoutSummary"("userId", "endedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GameWorkoutSummary_gameId_userId_key" ON "GameWorkoutSummary"("gameId", "userId");

-- CreateIndex
CREATE INDEX "GameOutcome_gameId_idx" ON "GameOutcome"("gameId");

-- CreateIndex
CREATE INDEX "GameOutcome_userId_idx" ON "GameOutcome"("userId");

-- CreateIndex
CREATE INDEX "GameOutcome_isWinner_idx" ON "GameOutcome"("isWinner");

-- CreateIndex
CREATE UNIQUE INDEX "GameOutcome_gameId_userId_key" ON "GameOutcome"("gameId", "userId");

-- CreateIndex
CREATE INDEX "GameTeam_gameId_idx" ON "GameTeam"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "GameTeam_gameId_teamNumber_key" ON "GameTeam"("gameId", "teamNumber");

-- CreateIndex
CREATE INDEX "GameTeamPlayer_gameTeamId_idx" ON "GameTeamPlayer"("gameTeamId");

-- CreateIndex
CREATE INDEX "GameTeamPlayer_userId_idx" ON "GameTeamPlayer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GameTeamPlayer_gameTeamId_userId_key" ON "GameTeamPlayer"("gameTeamId", "userId");

-- CreateIndex
CREATE INDEX "UserInteraction_fromUserId_idx" ON "UserInteraction"("fromUserId");

-- CreateIndex
CREATE INDEX "UserInteraction_toUserId_idx" ON "UserInteraction"("toUserId");

-- CreateIndex
CREATE INDEX "UserInteraction_count_idx" ON "UserInteraction"("count");

-- CreateIndex
CREATE UNIQUE INDEX "UserInteraction_fromUserId_toUserId_key" ON "UserInteraction"("fromUserId", "toUserId");

-- CreateIndex
CREATE INDEX "UserChat_user1Id_idx" ON "UserChat"("user1Id");

-- CreateIndex
CREATE INDEX "UserChat_user2Id_idx" ON "UserChat"("user2Id");

-- CreateIndex
CREATE INDEX "UserChat_updatedAt_idx" ON "UserChat"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserChat_user1Id_user2Id_key" ON "UserChat"("user1Id", "user2Id");

-- CreateIndex
CREATE INDEX "PinnedUserChat_userId_idx" ON "PinnedUserChat"("userId");

-- CreateIndex
CREATE INDEX "PinnedUserChat_userChatId_idx" ON "PinnedUserChat"("userChatId");

-- CreateIndex
CREATE UNIQUE INDEX "PinnedUserChat_userId_userChatId_key" ON "PinnedUserChat"("userId", "userChatId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_pollId_key" ON "ChatMessage"("pollId");

-- CreateIndex
CREATE INDEX "ChatMessage_chatContextType_contextId_idx" ON "ChatMessage"("chatContextType", "contextId");

-- CreateIndex
CREATE INDEX "ChatMessage_chatContextType_contextId_serverSyncSeq_idx" ON "ChatMessage"("chatContextType", "contextId", "serverSyncSeq");

-- CreateIndex
CREATE INDEX "ChatMessage_gameId_idx" ON "ChatMessage"("gameId");

-- CreateIndex
CREATE INDEX "ChatMessage_senderId_idx" ON "ChatMessage"("senderId");

-- CreateIndex
CREATE INDEX "ChatMessage_createdAt_idx" ON "ChatMessage"("createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_state_idx" ON "ChatMessage"("state");

-- CreateIndex
CREATE INDEX "ChatMessage_replyToId_idx" ON "ChatMessage"("replyToId");

-- CreateIndex
CREATE INDEX "ChatMessage_chatType_idx" ON "ChatMessage"("chatType");

-- CreateIndex
CREATE INDEX "ChatMessage_contextId_idx" ON "ChatMessage"("contextId");

-- CreateIndex
CREATE INDEX "ChatMessage_deletedAt_idx" ON "ChatMessage"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_senderId_clientMutationId_key" ON "ChatMessage"("senderId", "clientMutationId");

-- CreateIndex
CREATE INDEX "PinnedMessage_chatContextType_contextId_chatType_idx" ON "PinnedMessage"("chatContextType", "contextId", "chatType");

-- CreateIndex
CREATE INDEX "PinnedMessage_messageId_idx" ON "PinnedMessage"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "PinnedMessage_chatContextType_contextId_chatType_messageId_key" ON "PinnedMessage"("chatContextType", "contextId", "chatType", "messageId");

-- CreateIndex
CREATE UNIQUE INDEX "Poll_messageId_key" ON "Poll"("messageId");

-- CreateIndex
CREATE INDEX "PollOption_pollId_idx" ON "PollOption"("pollId");

-- CreateIndex
CREATE INDEX "PollVote_pollId_idx" ON "PollVote"("pollId");

-- CreateIndex
CREATE INDEX "PollVote_userId_idx" ON "PollVote"("userId");

-- CreateIndex
CREATE INDEX "PollVote_optionId_idx" ON "PollVote"("optionId");

-- CreateIndex
CREATE UNIQUE INDEX "PollVote_userId_optionId_key" ON "PollVote"("userId", "optionId");

-- CreateIndex
CREATE INDEX "ChatMute_userId_idx" ON "ChatMute"("userId");

-- CreateIndex
CREATE INDEX "ChatMute_chatContextType_contextId_idx" ON "ChatMute"("chatContextType", "contextId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMute_userId_chatContextType_contextId_key" ON "ChatMute"("userId", "chatContextType", "contextId");

-- CreateIndex
CREATE INDEX "ChatTranslationPreference_userId_idx" ON "ChatTranslationPreference"("userId");

-- CreateIndex
CREATE INDEX "ChatTranslationPreference_chatContextType_contextId_idx" ON "ChatTranslationPreference"("chatContextType", "contextId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatTranslationPreference_userId_chatContextType_contextId_key" ON "ChatTranslationPreference"("userId", "chatContextType", "contextId");

-- CreateIndex
CREATE INDEX "ChatAutoTranslateConfig_chatContextType_contextId_idx" ON "ChatAutoTranslateConfig"("chatContextType", "contextId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatAutoTranslateConfig_chatContextType_contextId_chatTypeK_key" ON "ChatAutoTranslateConfig"("chatContextType", "contextId", "chatTypeKey");

-- CreateIndex
CREATE UNIQUE INDEX "GameResultsArtifactJob_gameId_key" ON "GameResultsArtifactJob"("gameId");

-- CreateIndex
CREATE INDEX "GameResultsArtifactJob_status_runAfter_idx" ON "GameResultsArtifactJob"("status", "runAfter");

-- CreateIndex
CREATE INDEX "TranslationJob_status_runAfter_priority_idx" ON "TranslationJob"("status", "runAfter", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "TranslationJob_messageId_languageCode_key" ON "TranslationJob"("messageId", "languageCode");

-- CreateIndex
CREATE INDEX "ChatDraft_userId_idx" ON "ChatDraft"("userId");

-- CreateIndex
CREATE INDEX "ChatDraft_userId_updatedAt_idx" ON "ChatDraft"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "ChatDraft_chatContextType_contextId_idx" ON "ChatDraft"("chatContextType", "contextId");

-- CreateIndex
CREATE INDEX "ChatDraft_updatedAt_idx" ON "ChatDraft"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatDraft_userId_chatContextType_contextId_chatType_key" ON "ChatDraft"("userId", "chatContextType", "contextId", "chatType");

-- CreateIndex
CREATE INDEX "ChatMutationIdempotency_userId_createdAt_idx" ON "ChatMutationIdempotency"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMutationIdempotency_userId_clientMutationId_key" ON "ChatMutationIdempotency"("userId", "clientMutationId");

-- CreateIndex
CREATE INDEX "ChatReadCursor_userId_idx" ON "ChatReadCursor"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatReadCursor_userId_chatContextType_contextId_chatType_key" ON "ChatReadCursor"("userId", "chatContextType", "contextId", "chatType");

-- CreateIndex
CREATE INDEX "MessageReaction_messageId_idx" ON "MessageReaction"("messageId");

-- CreateIndex
CREATE INDEX "MessageReaction_userId_idx" ON "MessageReaction"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageReaction_messageId_userId_key" ON "MessageReaction"("messageId", "userId");

-- CreateIndex
CREATE INDEX "MessageReadReceipt_messageId_idx" ON "MessageReadReceipt"("messageId");

-- CreateIndex
CREATE INDEX "MessageReadReceipt_userId_idx" ON "MessageReadReceipt"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageReadReceipt_messageId_userId_key" ON "MessageReadReceipt"("messageId", "userId");

-- CreateIndex
CREATE INDEX "MessageTranslation_messageId_idx" ON "MessageTranslation"("messageId");

-- CreateIndex
CREATE INDEX "MessageTranslation_languageCode_idx" ON "MessageTranslation"("languageCode");

-- CreateIndex
CREATE UNIQUE INDEX "MessageTranslation_messageId_languageCode_key" ON "MessageTranslation"("messageId", "languageCode");

-- CreateIndex
CREATE UNIQUE INDEX "MessageTranscription_messageId_key" ON "MessageTranscription"("messageId");

-- CreateIndex
CREATE INDEX "MessageTranscription_messageId_idx" ON "MessageTranscription"("messageId");

-- CreateIndex
CREATE INDEX "UserFavoriteClub_userId_idx" ON "UserFavoriteClub"("userId");

-- CreateIndex
CREATE INDEX "UserFavoriteClub_clubId_idx" ON "UserFavoriteClub"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "UserFavoriteClub_userId_clubId_key" ON "UserFavoriteClub"("userId", "clubId");

-- CreateIndex
CREATE INDEX "UserFavoriteUser_userId_idx" ON "UserFavoriteUser"("userId");

-- CreateIndex
CREATE INDEX "UserFavoriteUser_favoriteUserId_idx" ON "UserFavoriteUser"("favoriteUserId");

-- CreateIndex
CREATE UNIQUE INDEX "UserFavoriteUser_userId_favoriteUserId_key" ON "UserFavoriteUser"("userId", "favoriteUserId");

-- CreateIndex
CREATE INDEX "BlockedUser_userId_idx" ON "BlockedUser"("userId");

-- CreateIndex
CREATE INDEX "BlockedUser_blockedUserId_idx" ON "BlockedUser"("blockedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "BlockedUser_userId_blockedUserId_key" ON "BlockedUser"("userId", "blockedUserId");

-- CreateIndex
CREATE INDEX "UserTeam_ownerId_idx" ON "UserTeam"("ownerId");

-- CreateIndex
CREATE INDEX "UserTeamMember_teamId_idx" ON "UserTeamMember"("teamId");

-- CreateIndex
CREATE INDEX "UserTeamMember_userId_idx" ON "UserTeamMember"("userId");

-- CreateIndex
CREATE INDEX "UserTeamMember_status_idx" ON "UserTeamMember"("status");

-- CreateIndex
CREATE UNIQUE INDEX "UserTeamMember_teamId_userId_key" ON "UserTeamMember"("teamId", "userId");

-- CreateIndex
CREATE INDEX "ConversationSyncState_contextId_idx" ON "ConversationSyncState"("contextId");

-- CreateIndex
CREATE INDEX "ChatSyncEvent_contextType_contextId_seq_idx" ON "ChatSyncEvent"("contextType", "contextId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "ChatSyncEvent_contextType_contextId_seq_key" ON "ChatSyncEvent"("contextType", "contextId", "seq");

-- CreateIndex
CREATE INDEX "TelegramOtp_code_idx" ON "TelegramOtp"("code");

-- CreateIndex
CREATE INDEX "TelegramOtp_telegramId_idx" ON "TelegramOtp"("telegramId");

-- CreateIndex
CREATE INDEX "TelegramOtp_expiresAt_idx" ON "TelegramOtp"("expiresAt");

-- CreateIndex
CREATE INDEX "TelegramOtp_linkKey_idx" ON "TelegramOtp"("linkKey");

-- CreateIndex
CREATE INDEX "TelegramOtp_linkUserId_idx" ON "TelegramOtp"("linkUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramAccountLinkIntent_token_key" ON "TelegramAccountLinkIntent"("token");

-- CreateIndex
CREATE INDEX "TelegramAccountLinkIntent_userId_idx" ON "TelegramAccountLinkIntent"("userId");

-- CreateIndex
CREATE INDEX "Bug_senderId_idx" ON "Bug"("senderId");

-- CreateIndex
CREATE INDEX "Bug_status_idx" ON "Bug"("status");

-- CreateIndex
CREATE INDEX "Bug_bugType_idx" ON "Bug"("bugType");

-- CreateIndex
CREATE INDEX "BugParticipant_bugId_idx" ON "BugParticipant"("bugId");

-- CreateIndex
CREATE INDEX "BugParticipant_userId_idx" ON "BugParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BugParticipant_bugId_userId_key" ON "BugParticipant"("bugId", "userId");

-- CreateIndex
CREATE INDEX "MarketItemCategory_isActive_idx" ON "MarketItemCategory"("isActive");

-- CreateIndex
CREATE INDEX "MarketItemCategory_order_idx" ON "MarketItemCategory"("order");

-- CreateIndex
CREATE INDEX "MarketItemCategory_sport_idx" ON "MarketItemCategory"("sport");

-- CreateIndex
CREATE INDEX "MarketItem_sellerId_idx" ON "MarketItem"("sellerId");

-- CreateIndex
CREATE INDEX "MarketItem_categoryId_idx" ON "MarketItem"("categoryId");

-- CreateIndex
CREATE INDEX "MarketItem_cityId_idx" ON "MarketItem"("cityId");

-- CreateIndex
CREATE INDEX "MarketItem_status_idx" ON "MarketItem"("status");

-- CreateIndex
CREATE INDEX "MarketItem_createdAt_idx" ON "MarketItem"("createdAt");

-- CreateIndex
CREATE INDEX "MarketItem_winnerId_idx" ON "MarketItem"("winnerId");

-- CreateIndex
CREATE INDEX "MarketItemBid_marketItemId_idx" ON "MarketItemBid"("marketItemId");

-- CreateIndex
CREATE INDEX "MarketItemBid_bidderId_idx" ON "MarketItemBid"("bidderId");

-- CreateIndex
CREATE INDEX "MarketItemBid_marketItemId_createdAt_idx" ON "MarketItemBid"("marketItemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GroupChannel_bugId_key" ON "GroupChannel"("bugId");

-- CreateIndex
CREATE INDEX "GroupChannel_isPublic_idx" ON "GroupChannel"("isPublic");

-- CreateIndex
CREATE INDEX "GroupChannel_isChannel_idx" ON "GroupChannel"("isChannel");

-- CreateIndex
CREATE INDEX "GroupChannel_isCityGroup_idx" ON "GroupChannel"("isCityGroup");

-- CreateIndex
CREATE INDEX "GroupChannel_cityId_idx" ON "GroupChannel"("cityId");

-- CreateIndex
CREATE INDEX "GroupChannel_bugId_idx" ON "GroupChannel"("bugId");

-- CreateIndex
CREATE INDEX "GroupChannel_marketItemId_idx" ON "GroupChannel"("marketItemId");

-- CreateIndex
CREATE INDEX "GroupChannel_buyerId_idx" ON "GroupChannel"("buyerId");

-- CreateIndex
CREATE INDEX "PinnedGroupChannel_userId_idx" ON "PinnedGroupChannel"("userId");

-- CreateIndex
CREATE INDEX "PinnedGroupChannel_groupChannelId_idx" ON "PinnedGroupChannel"("groupChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "PinnedGroupChannel_userId_groupChannelId_key" ON "PinnedGroupChannel"("userId", "groupChannelId");

-- CreateIndex
CREATE INDEX "GroupChannelParticipant_groupChannelId_idx" ON "GroupChannelParticipant"("groupChannelId");

-- CreateIndex
CREATE INDEX "GroupChannelParticipant_userId_idx" ON "GroupChannelParticipant"("userId");

-- CreateIndex
CREATE INDEX "GroupChannelParticipant_hidden_idx" ON "GroupChannelParticipant"("hidden");

-- CreateIndex
CREATE UNIQUE INDEX "GroupChannelParticipant_groupChannelId_userId_key" ON "GroupChannelParticipant"("groupChannelId", "userId");

-- CreateIndex
CREATE INDEX "GroupChannelInvite_groupChannelId_idx" ON "GroupChannelInvite"("groupChannelId");

-- CreateIndex
CREATE INDEX "GroupChannelInvite_receiverId_idx" ON "GroupChannelInvite"("receiverId");

-- CreateIndex
CREATE INDEX "GroupChannelInvite_status_idx" ON "GroupChannelInvite"("status");

-- CreateIndex
CREATE INDEX "GroupChannelInvite_expiresAt_idx" ON "GroupChannelInvite"("expiresAt");

-- CreateIndex
CREATE INDEX "GameCourt_gameId_idx" ON "GameCourt"("gameId");

-- CreateIndex
CREATE INDEX "GameCourt_courtId_idx" ON "GameCourt"("courtId");

-- CreateIndex
CREATE UNIQUE INDEX "GameCourt_gameId_courtId_key" ON "GameCourt"("gameId", "courtId");

-- CreateIndex
CREATE UNIQUE INDEX "GameCourt_gameId_order_key" ON "GameCourt"("gameId", "order");

-- CreateIndex
CREATE INDEX "Goods_name_idx" ON "Goods"("name");

-- CreateIndex
CREATE INDEX "Transaction_fromUserId_idx" ON "Transaction"("fromUserId");

-- CreateIndex
CREATE INDEX "Transaction_toUserId_idx" ON "Transaction"("toUserId");

-- CreateIndex
CREATE INDEX "Transaction_type_idx" ON "Transaction"("type");

-- CreateIndex
CREATE INDEX "Transaction_createdAt_idx" ON "Transaction"("createdAt");

-- CreateIndex
CREATE INDEX "TransactionRow_transactionId_idx" ON "TransactionRow"("transactionId");

-- CreateIndex
CREATE INDEX "TransactionRow_goodsId_idx" ON "TransactionRow"("goodsId");

-- CreateIndex
CREATE INDEX "LevelChangeEvent_userId_idx" ON "LevelChangeEvent"("userId");

-- CreateIndex
CREATE INDEX "LevelChangeEvent_gameId_idx" ON "LevelChangeEvent"("gameId");

-- CreateIndex
CREATE INDEX "LevelChangeEvent_eventType_idx" ON "LevelChangeEvent"("eventType");

-- CreateIndex
CREATE INDEX "LevelChangeEvent_createdAt_idx" ON "LevelChangeEvent"("createdAt");

-- CreateIndex
CREATE INDEX "LevelChangeEvent_sport_idx" ON "LevelChangeEvent"("sport");

-- CreateIndex
CREATE INDEX "League_cityId_idx" ON "League"("cityId");

-- CreateIndex
CREATE INDEX "League_clubId_idx" ON "League"("clubId");

-- CreateIndex
CREATE INDEX "LeagueSeason_leagueId_idx" ON "LeagueSeason"("leagueId");

-- CreateIndex
CREATE INDEX "LeagueSeason_orderIndex_idx" ON "LeagueSeason"("orderIndex");

-- CreateIndex
CREATE INDEX "LeagueGroup_leagueSeasonId_idx" ON "LeagueGroup"("leagueSeasonId");

-- CreateIndex
CREATE INDEX "LeagueTeam_id_idx" ON "LeagueTeam"("id");

-- CreateIndex
CREATE INDEX "LeagueTeamPlayer_leagueTeamId_idx" ON "LeagueTeamPlayer"("leagueTeamId");

-- CreateIndex
CREATE INDEX "LeagueTeamPlayer_userId_idx" ON "LeagueTeamPlayer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueTeamPlayer_leagueTeamId_userId_key" ON "LeagueTeamPlayer"("leagueTeamId", "userId");

-- CreateIndex
CREATE INDEX "LeagueParticipant_leagueId_idx" ON "LeagueParticipant"("leagueId");

-- CreateIndex
CREATE INDEX "LeagueParticipant_leagueSeasonId_idx" ON "LeagueParticipant"("leagueSeasonId");

-- CreateIndex
CREATE INDEX "LeagueParticipant_userId_idx" ON "LeagueParticipant"("userId");

-- CreateIndex
CREATE INDEX "LeagueParticipant_leagueTeamId_idx" ON "LeagueParticipant"("leagueTeamId");

-- CreateIndex
CREATE INDEX "LeagueParticipant_currentGroupId_idx" ON "LeagueParticipant"("currentGroupId");

-- CreateIndex
CREATE INDEX "LeagueParticipant_participantType_idx" ON "LeagueParticipant"("participantType");

-- CreateIndex
CREATE INDEX "LeagueRound_leagueSeasonId_idx" ON "LeagueRound"("leagueSeasonId");

-- CreateIndex
CREATE INDEX "LeagueRound_orderIndex_idx" ON "LeagueRound"("orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueBracketSlot_gameId_key" ON "LeagueBracketSlot"("gameId");

-- CreateIndex
CREATE INDEX "LeagueBracketSlot_leagueRoundId_idx" ON "LeagueBracketSlot"("leagueRoundId");

-- CreateIndex
CREATE INDEX "LeagueBracketSlot_leagueGroupId_idx" ON "LeagueBracketSlot"("leagueGroupId");

-- CreateIndex
CREATE INDEX "LeagueBracketSlot_gameId_idx" ON "LeagueBracketSlot"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueBracketSlot_leagueRoundId_leagueGroupId_slotKey_key" ON "LeagueBracketSlot"("leagueRoundId", "leagueGroupId", "slotKey");

-- CreateIndex
CREATE INDEX "PushToken_userId_idx" ON "PushToken"("userId");

-- CreateIndex
CREATE INDEX "PushToken_token_idx" ON "PushToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_userId_token_key" ON "PushToken"("userId", "token");

-- CreateIndex
CREATE INDEX "DeletedUser_originalUserId_idx" ON "DeletedUser"("originalUserId");

-- CreateIndex
CREATE INDEX "DeletedUser_deletedAt_idx" ON "DeletedUser"("deletedAt");

-- CreateIndex
CREATE INDEX "NotificationPreference_userId_idx" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_channelType_key" ON "NotificationPreference"("userId", "channelType");

-- CreateIndex
CREATE INDEX "MessageReport_messageId_idx" ON "MessageReport"("messageId");

-- CreateIndex
CREATE INDEX "MessageReport_reporterId_idx" ON "MessageReport"("reporterId");

-- CreateIndex
CREATE INDEX "MessageReport_status_idx" ON "MessageReport"("status");

-- CreateIndex
CREATE INDEX "MessageReport_createdAt_idx" ON "MessageReport"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessageReport_messageId_reporterId_key" ON "MessageReport"("messageId", "reporterId");

-- CreateIndex
CREATE INDEX "GameSubscription_userId_idx" ON "GameSubscription"("userId");

-- CreateIndex
CREATE INDEX "GameSubscription_cityId_idx" ON "GameSubscription"("cityId");

-- CreateIndex
CREATE INDEX "GameSubscription_isActive_idx" ON "GameSubscription"("isActive");

-- CreateIndex
CREATE INDEX "GameSubscription_userId_isActive_cityId_idx" ON "GameSubscription"("userId", "isActive", "cityId");

-- CreateIndex
CREATE INDEX "Bet_gameId_idx" ON "Bet"("gameId");

-- CreateIndex
CREATE INDEX "Bet_creatorId_idx" ON "Bet"("creatorId");

-- CreateIndex
CREATE INDEX "Bet_status_idx" ON "Bet"("status");

-- CreateIndex
CREATE INDEX "Bet_gameId_status_idx" ON "Bet"("gameId", "status");

-- CreateIndex
CREATE INDEX "Bet_acceptedBy_idx" ON "Bet"("acceptedBy");

-- CreateIndex
CREATE INDEX "BetParticipant_betId_idx" ON "BetParticipant"("betId");

-- CreateIndex
CREATE INDEX "BetParticipant_userId_idx" ON "BetParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BetParticipant_betId_userId_key" ON "BetParticipant"("betId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AppVersionRequirement_platform_key" ON "AppVersionRequirement"("platform");

-- CreateIndex
CREATE INDEX "AppVersionRequirement_platform_idx" ON "AppVersionRequirement"("platform");

-- CreateIndex
CREATE INDEX "UserGameNote_userId_idx" ON "UserGameNote"("userId");

-- CreateIndex
CREATE INDEX "UserGameNote_gameId_idx" ON "UserGameNote"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "UserGameNote_userId_gameId_key" ON "UserGameNote"("userId", "gameId");

-- CreateIndex
CREATE INDEX "ExchangeRate_baseCurrency_idx" ON "ExchangeRate"("baseCurrency");

-- CreateIndex
CREATE INDEX "ExchangeRate_lastUpdated_idx" ON "ExchangeRate"("lastUpdated");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_baseCurrency_targetCurrency_key" ON "ExchangeRate"("baseCurrency", "targetCurrency");

-- CreateIndex
CREATE INDEX "LlmUsageLog_provider_idx" ON "LlmUsageLog"("provider");

-- CreateIndex
CREATE INDEX "LlmUsageLog_model_idx" ON "LlmUsageLog"("model");

-- CreateIndex
CREATE INDEX "LlmUsageLog_userId_idx" ON "LlmUsageLog"("userId");

-- CreateIndex
CREATE INDEX "LlmUsageLog_reason_idx" ON "LlmUsageLog"("reason");

-- CreateIndex
CREATE INDEX "LlmUsageLog_createdAt_idx" ON "LlmUsageLog"("createdAt");

-- CreateIndex
CREATE INDEX "AdSponsor_clubId_idx" ON "AdSponsor"("clubId");

-- CreateIndex
CREATE INDEX "AdCampaign_sponsorId_idx" ON "AdCampaign"("sponsorId");

-- CreateIndex
CREATE INDEX "AdCampaign_status_idx" ON "AdCampaign"("status");

-- CreateIndex
CREATE INDEX "AdCampaign_startsAt_idx" ON "AdCampaign"("startsAt");

-- CreateIndex
CREATE INDEX "AdCampaign_endsAt_idx" ON "AdCampaign"("endsAt");

-- CreateIndex
CREATE INDEX "AdCreative_campaignId_idx" ON "AdCreative"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "AdCreative_campaignId_placement_locale_variantKey_key" ON "AdCreative"("campaignId", "placement", "locale", "variantKey");

-- CreateIndex
CREATE UNIQUE INDEX "AdEvent_eventId_key" ON "AdEvent"("eventId");

-- CreateIndex
CREATE INDEX "AdEvent_campaignId_type_createdAt_idx" ON "AdEvent"("campaignId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "AdEvent_placement_createdAt_idx" ON "AdEvent"("placement", "createdAt");

-- CreateIndex
CREATE INDEX "AdEvent_createdAt_idx" ON "AdEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AdUserState_campaignId_idx" ON "AdUserState"("campaignId");

-- CreateIndex
CREATE INDEX "AdSessionPick_userId_idx" ON "AdSessionPick"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AdSessionPick_adSessionId_userId_placement_contextKey_key" ON "AdSessionPick"("adSessionId", "userId", "placement", "contextKey");

-- CreateIndex
CREATE INDEX "AdCampaignDailyStats_sponsorId_date_idx" ON "AdCampaignDailyStats"("sponsorId", "date");

-- CreateIndex
CREATE INDEX "AdCampaignDailyStats_campaignId_date_idx" ON "AdCampaignDailyStats"("campaignId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AdCampaignDailyStats_campaignId_date_placement_cityId_local_key" ON "AdCampaignDailyStats"("campaignId", "date", "placement", "cityId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "AdTargetingPreset_name_key" ON "AdTargetingPreset"("name");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_currentCityId_fkey" FOREIGN KEY ("currentCityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_favoriteTrainerId_fkey" FOREIGN KEY ("favoriteTrainerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_refresh_sessions" ADD CONSTRAINT "user_refresh_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LundaProfile" ADD CONSTRAINT "LundaProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Club" ADD CONSTRAINT "Club_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserClubBooktimeAuth" ADD CONSTRAINT "UserClubBooktimeAuth_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserClubBooktimeAuth" ADD CONSTRAINT "UserClubBooktimeAuth_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubBooktimeBusySnapshot" ADD CONSTRAINT "ClubBooktimeBusySnapshot_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubBooktimeBusySnapshot" ADD CONSTRAINT "ClubBooktimeBusySnapshot_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSportProfile" ADD CONSTRAINT "UserSportProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Court" ADD CONSTRAINT "Court_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubAdmin" ADD CONSTRAINT "ClubAdmin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubAdmin" ADD CONSTRAINT "ClubAdmin_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtSlotHold" ADD CONSTRAINT "CourtSlotHold_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtSlotHold" ADD CONSTRAINT "CourtSlotHold_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtSlotHold" ADD CONSTRAINT "CourtSlotHold_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_leagueRoundId_fkey" FOREIGN KEY ("leagueRoundId") REFERENCES "LeagueRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_leagueGroupId_fkey" FOREIGN KEY ("leagueGroupId") REFERENCES "LeagueGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_mainPhotoId_fkey" FOREIGN KEY ("mainPhotoId") REFERENCES "GamePhoto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameExternalBooking" ADD CONSTRAINT "GameExternalBooking_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameExternalBooking" ADD CONSTRAINT "GameExternalBooking_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePhoto" ADD CONSTRAINT "GamePhoto_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePhoto" ADD CONSTRAINT "GamePhoto_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameReaction" ADD CONSTRAINT "GameReaction_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameReaction" ADD CONSTRAINT "GameReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStory" ADD CONSTRAINT "UserStory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserStoryItem" ADD CONSTRAINT "UserStoryItem_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "UserStory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorySegmentLike" ADD CONSTRAINT "StorySegmentLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorySegmentComment" ADD CONSTRAINT "StorySegmentComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorySegmentComment" ADD CONSTRAINT "StorySegmentComment_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StorySegmentComment" ADD CONSTRAINT "StorySegmentComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "StorySegmentComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryCommentLike" ADD CONSTRAINT "StoryCommentLike_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "StorySegmentComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryCommentLike" ADD CONSTRAINT "StoryCommentLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryCommentReport" ADD CONSTRAINT "StoryCommentReport_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "StorySegmentComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryCommentReport" ADD CONSTRAINT "StoryCommentReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserReactionEmojiStat" ADD CONSTRAINT "UserReactionEmojiStat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancelledGame" ADD CONSTRAINT "CancelledGame_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameFaq" ADD CONSTRAINT "GameFaq_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerReview" ADD CONSTRAINT "TrainerReview_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerReview" ADD CONSTRAINT "TrainerReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerReview" ADD CONSTRAINT "TrainerReview_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubReview" ADD CONSTRAINT "ClubReview_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubReview" ADD CONSTRAINT "ClubReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubReview" ADD CONSTRAINT "ClubReview_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameParticipant" ADD CONSTRAINT "GameParticipant_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameParticipant" ADD CONSTRAINT "GameParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameParticipant" ADD CONSTRAINT "GameParticipant_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameParticipant" ADD CONSTRAINT "GameParticipant_activeMatchId_fkey" FOREIGN KEY ("activeMatchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameInviteOutcome" ADD CONSTRAINT "GameInviteOutcome_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameInviteOutcome" ADD CONSTRAINT "GameInviteOutcome_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameInviteOutcome" ADD CONSTRAINT "GameInviteOutcome_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchLiveScoringAudit" ADD CONSTRAINT "MatchLiveScoringAudit_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPlayer" ADD CONSTRAINT "TeamPlayer_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamPlayer" ADD CONSTRAINT "TeamPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Set" ADD CONSTRAINT "Set_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundOutcome" ADD CONSTRAINT "RoundOutcome_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundOutcome" ADD CONSTRAINT "RoundOutcome_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameWorkoutSummary" ADD CONSTRAINT "GameWorkoutSummary_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameWorkoutSummary" ADD CONSTRAINT "GameWorkoutSummary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameOutcome" ADD CONSTRAINT "GameOutcome_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameOutcome" ADD CONSTRAINT "GameOutcome_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameTeam" ADD CONSTRAINT "GameTeam_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameTeamPlayer" ADD CONSTRAINT "GameTeamPlayer_gameTeamId_fkey" FOREIGN KEY ("gameTeamId") REFERENCES "GameTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameTeamPlayer" ADD CONSTRAINT "GameTeamPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInteraction" ADD CONSTRAINT "UserInteraction_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInteraction" ADD CONSTRAINT "UserInteraction_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserChat" ADD CONSTRAINT "UserChat_user1Id_fkey" FOREIGN KEY ("user1Id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserChat" ADD CONSTRAINT "UserChat_user2Id_fkey" FOREIGN KEY ("user2Id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PinnedUserChat" ADD CONSTRAINT "PinnedUserChat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PinnedUserChat" ADD CONSTRAINT "PinnedUserChat_userChatId_fkey" FOREIGN KEY ("userChatId") REFERENCES "UserChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PinnedMessage" ADD CONSTRAINT "PinnedMessage_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PinnedMessage" ADD CONSTRAINT "PinnedMessage_pinnedById_fkey" FOREIGN KEY ("pinnedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Poll" ADD CONSTRAINT "Poll_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollOption" ADD CONSTRAINT "PollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "PollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMute" ADD CONSTRAINT "ChatMute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatTranslationPreference" ADD CONSTRAINT "ChatTranslationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameResultsArtifactJob" ADD CONSTRAINT "GameResultsArtifactJob_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatDraft" ADD CONSTRAINT "ChatDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMutationIdempotency" ADD CONSTRAINT "ChatMutationIdempotency_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReadCursor" ADD CONSTRAINT "ChatReadCursor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReadReceipt" ADD CONSTRAINT "MessageReadReceipt_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReadReceipt" ADD CONSTRAINT "MessageReadReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageTranslation" ADD CONSTRAINT "MessageTranslation_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageTranslation" ADD CONSTRAINT "MessageTranslation_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageTranscription" ADD CONSTRAINT "MessageTranscription_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageTranscription" ADD CONSTRAINT "MessageTranscription_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFavoriteClub" ADD CONSTRAINT "UserFavoriteClub_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFavoriteClub" ADD CONSTRAINT "UserFavoriteClub_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFavoriteUser" ADD CONSTRAINT "UserFavoriteUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFavoriteUser" ADD CONSTRAINT "UserFavoriteUser_favoriteUserId_fkey" FOREIGN KEY ("favoriteUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockedUser" ADD CONSTRAINT "BlockedUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockedUser" ADD CONSTRAINT "BlockedUser_blockedUserId_fkey" FOREIGN KEY ("blockedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTeam" ADD CONSTRAINT "UserTeam_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTeamMember" ADD CONSTRAINT "UserTeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "UserTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTeamMember" ADD CONSTRAINT "UserTeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramAccountLinkIntent" ADD CONSTRAINT "TelegramAccountLinkIntent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bug" ADD CONSTRAINT "Bug_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugParticipant" ADD CONSTRAINT "BugParticipant_bugId_fkey" FOREIGN KEY ("bugId") REFERENCES "Bug"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugParticipant" ADD CONSTRAINT "BugParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketItem" ADD CONSTRAINT "MarketItem_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketItem" ADD CONSTRAINT "MarketItem_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketItem" ADD CONSTRAINT "MarketItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MarketItemCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketItem" ADD CONSTRAINT "MarketItem_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketItemBid" ADD CONSTRAINT "MarketItemBid_marketItemId_fkey" FOREIGN KEY ("marketItemId") REFERENCES "MarketItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketItemBid" ADD CONSTRAINT "MarketItemBid_bidderId_fkey" FOREIGN KEY ("bidderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupChannel" ADD CONSTRAINT "GroupChannel_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupChannel" ADD CONSTRAINT "GroupChannel_bugId_fkey" FOREIGN KEY ("bugId") REFERENCES "Bug"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupChannel" ADD CONSTRAINT "GroupChannel_marketItemId_fkey" FOREIGN KEY ("marketItemId") REFERENCES "MarketItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupChannel" ADD CONSTRAINT "GroupChannel_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupChannel" ADD CONSTRAINT "GroupChannel_lastMessageSenderId_fkey" FOREIGN KEY ("lastMessageSenderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PinnedGroupChannel" ADD CONSTRAINT "PinnedGroupChannel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PinnedGroupChannel" ADD CONSTRAINT "PinnedGroupChannel_groupChannelId_fkey" FOREIGN KEY ("groupChannelId") REFERENCES "GroupChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupChannelParticipant" ADD CONSTRAINT "GroupChannelParticipant_groupChannelId_fkey" FOREIGN KEY ("groupChannelId") REFERENCES "GroupChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupChannelParticipant" ADD CONSTRAINT "GroupChannelParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupChannelInvite" ADD CONSTRAINT "GroupChannelInvite_groupChannelId_fkey" FOREIGN KEY ("groupChannelId") REFERENCES "GroupChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupChannelInvite" ADD CONSTRAINT "GroupChannelInvite_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupChannelInvite" ADD CONSTRAINT "GroupChannelInvite_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameCourt" ADD CONSTRAINT "GameCourt_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameCourt" ADD CONSTRAINT "GameCourt_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionRow" ADD CONSTRAINT "TransactionRow_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionRow" ADD CONSTRAINT "TransactionRow_goodsId_fkey" FOREIGN KEY ("goodsId") REFERENCES "Goods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LevelChangeEvent" ADD CONSTRAINT "LevelChangeEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LevelChangeEvent" ADD CONSTRAINT "LevelChangeEvent_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "League" ADD CONSTRAINT "League_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "League" ADD CONSTRAINT "League_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueSeason" ADD CONSTRAINT "LeagueSeason_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueSeason" ADD CONSTRAINT "LeagueSeason_id_fkey" FOREIGN KEY ("id") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueGroup" ADD CONSTRAINT "LeagueGroup_leagueSeasonId_fkey" FOREIGN KEY ("leagueSeasonId") REFERENCES "LeagueSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueGroup" ADD CONSTRAINT "LeagueGroup_betterGroupId_fkey" FOREIGN KEY ("betterGroupId") REFERENCES "LeagueGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueGroup" ADD CONSTRAINT "LeagueGroup_worseGroupId_fkey" FOREIGN KEY ("worseGroupId") REFERENCES "LeagueGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueTeamPlayer" ADD CONSTRAINT "LeagueTeamPlayer_leagueTeamId_fkey" FOREIGN KEY ("leagueTeamId") REFERENCES "LeagueTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueTeamPlayer" ADD CONSTRAINT "LeagueTeamPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueParticipant" ADD CONSTRAINT "LeagueParticipant_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueParticipant" ADD CONSTRAINT "LeagueParticipant_leagueSeasonId_fkey" FOREIGN KEY ("leagueSeasonId") REFERENCES "LeagueSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueParticipant" ADD CONSTRAINT "LeagueParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueParticipant" ADD CONSTRAINT "LeagueParticipant_leagueTeamId_fkey" FOREIGN KEY ("leagueTeamId") REFERENCES "LeagueTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueParticipant" ADD CONSTRAINT "LeagueParticipant_currentGroupId_fkey" FOREIGN KEY ("currentGroupId") REFERENCES "LeagueGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueRound" ADD CONSTRAINT "LeagueRound_leagueSeasonId_fkey" FOREIGN KEY ("leagueSeasonId") REFERENCES "LeagueSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueBracketSlot" ADD CONSTRAINT "LeagueBracketSlot_leagueRoundId_fkey" FOREIGN KEY ("leagueRoundId") REFERENCES "LeagueRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueBracketSlot" ADD CONSTRAINT "LeagueBracketSlot_leagueGroupId_fkey" FOREIGN KEY ("leagueGroupId") REFERENCES "LeagueGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueBracketSlot" ADD CONSTRAINT "LeagueBracketSlot_leagueParticipantId_fkey" FOREIGN KEY ("leagueParticipantId") REFERENCES "LeagueParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueBracketSlot" ADD CONSTRAINT "LeagueBracketSlot_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueBracketSlot" ADD CONSTRAINT "LeagueBracketSlot_winnerSlotId_fkey" FOREIGN KEY ("winnerSlotId") REFERENCES "LeagueBracketSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueBracketSlot" ADD CONSTRAINT "LeagueBracketSlot_feederSlotAId_fkey" FOREIGN KEY ("feederSlotAId") REFERENCES "LeagueBracketSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueBracketSlot" ADD CONSTRAINT "LeagueBracketSlot_feederSlotBId_fkey" FOREIGN KEY ("feederSlotBId") REFERENCES "LeagueBracketSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushToken" ADD CONSTRAINT "PushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReport" ADD CONSTRAINT "MessageReport_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReport" ADD CONSTRAINT "MessageReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameSubscription" ADD CONSTRAINT "GameSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameSubscription" ADD CONSTRAINT "GameSubscription_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bet" ADD CONSTRAINT "Bet_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bet" ADD CONSTRAINT "Bet_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bet" ADD CONSTRAINT "Bet_acceptedBy_fkey" FOREIGN KEY ("acceptedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bet" ADD CONSTRAINT "Bet_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BetParticipant" ADD CONSTRAINT "BetParticipant_betId_fkey" FOREIGN KEY ("betId") REFERENCES "Bet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BetParticipant" ADD CONSTRAINT "BetParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdSponsor" ADD CONSTRAINT "AdSponsor_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "AdSponsor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCreative" ADD CONSTRAINT "AdCreative_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaignPlacement" ADD CONSTRAINT "AdCampaignPlacement_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdEvent" ADD CONSTRAINT "AdEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdUserState" ADD CONSTRAINT "AdUserState_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdSessionPick" ADD CONSTRAINT "AdSessionPick_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaignDailyStats" ADD CONSTRAINT "AdCampaignDailyStats_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
