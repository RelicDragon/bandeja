UPDATE "Game"
SET
  "scoringPreset" = 'CLASSIC_SINGLE_SET',
  "matchTimerEnabled" = true
WHERE "scoringPreset" = 'CLASSIC_TIMED';

UPDATE "Game"
SET
  "scoringPreset" = 'POINTS_21',
  "matchTimerEnabled" = true,
  "maxTotalPointsPerSet" = CASE WHEN "maxTotalPointsPerSet" = 0 THEN 21 ELSE "maxTotalPointsPerSet" END,
  "ballsInGames" = false
WHERE "scoringPreset" = 'TIMED';
