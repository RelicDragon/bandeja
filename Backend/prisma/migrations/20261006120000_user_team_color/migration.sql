-- Optional team colour (palette key from @bandeja/shared/userTeamColors); NULL = app default.
ALTER TABLE "UserTeam" ADD COLUMN "color" VARCHAR(16);
