-- Premium appearance: member themes, public name styles, animated avatars.
-- The new MainTheme values are only added here, never used in this migration,
-- so ALTER TYPE ... ADD VALUE is safe inside the migration transaction.

-- CreateEnum
CREATE TYPE "PremiumNameStyle" AS ENUM ('gold', 'platinum', 'rose', 'ember', 'aurora', 'neon', 'holo', 'frost');

-- AlterEnum
ALTER TYPE "MainTheme" ADD VALUE 'spring';
ALTER TYPE "MainTheme" ADD VALUE 'cyberpunk';
ALTER TYPE "MainTheme" ADD VALUE 'steampunk';
ALTER TYPE "MainTheme" ADD VALUE 'woodstone';
ALTER TYPE "MainTheme" ADD VALUE 'ocean';
ALTER TYPE "MainTheme" ADD VALUE 'nordic';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarAnimated" TEXT,
ADD COLUMN     "premiumNameStyle" "PremiumNameStyle" NOT NULL DEFAULT 'gold';
