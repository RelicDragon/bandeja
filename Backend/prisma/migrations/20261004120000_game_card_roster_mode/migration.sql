-- Game card roster: the boolean (never shipped) becomes AUTO / COMPACT / FULL, AUTO for everyone.
CREATE TYPE "GameCardRosterMode" AS ENUM ('AUTO', 'COMPACT', 'FULL');

ALTER TABLE "User" ADD COLUMN "gameCardRosterMode" "GameCardRosterMode" NOT NULL DEFAULT 'AUTO';

ALTER TABLE "User" DROP COLUMN IF EXISTS "gameCardFullRoster";
