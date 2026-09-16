-- CreateEnum
CREATE TYPE "MainTheme" AS ENUM ('classic', 'premium');

-- AlterTable
-- Keep existing premium accounts on Premium; membership still gates the styling.
ALTER TABLE "User" ADD COLUMN "mainTheme" "MainTheme" NOT NULL DEFAULT 'premium';
