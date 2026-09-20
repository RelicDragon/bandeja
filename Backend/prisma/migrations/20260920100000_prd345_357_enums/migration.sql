-- CreateEnum
CREATE TYPE "ParticipantAttendance" AS ENUM ('UNANSWERED', 'CONFIRMED', 'UNSURE');

-- CreateEnum
CREATE TYPE "GameSeriesCadence" AS ENUM ('WEEKLY', 'BIWEEKLY');

-- CreateEnum
CREATE TYPE "GameSeriesStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "CostShareMethod" AS ENUM ('MANUAL', 'COINS');

-- CreateEnum
CREATE TYPE "GoodsKind" AS ENUM ('PROFILE_FRAME', 'CHAT_ACCENT', 'STICKER_PACK', 'NAME_COLOR');

-- CreateEnum
CREATE TYPE "SpotOpenedKind" AS ENUM ('QUEUE', 'INTENT', 'FOLLOWER');
