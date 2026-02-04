-- Migrate existing User notification preferences to NotificationPreference table
-- Users with PushToken get PUSH preference
INSERT INTO "NotificationPreference" ("id", "userId", "channelType", "sendMessages", "sendInvites", "sendDirectMessages", "sendReminders", "sendWalletNotifications", "createdAt", "updatedAt")
SELECT 
  gen_random_uuid()::text,
  u."id",
  'PUSH',
  u."sendPushMessages",
  u."sendPushInvites",
  u."sendPushDirectMessages",
  u."sendPushReminders",
  u."sendPushWalletNotifications",
  NOW(),
  NOW()
FROM "User" u
WHERE EXISTS (SELECT 1 FROM "PushToken" pt WHERE pt."userId" = u."id")
ON CONFLICT ("userId", "channelType") DO NOTHING;

-- Users with telegramId get TELEGRAM preference
INSERT INTO "NotificationPreference" ("id", "userId", "channelType", "sendMessages", "sendInvites", "sendDirectMessages", "sendReminders", "sendWalletNotifications", "createdAt", "updatedAt")
SELECT 
  gen_random_uuid()::text,
  u."id",
  'TELEGRAM',
  u."sendTelegramMessages",
  u."sendTelegramInvites",
  u."sendTelegramDirectMessages",
  u."sendTelegramReminders",
  u."sendTelegramWalletNotifications",
  NOW(),
  NOW()
FROM "User" u
WHERE u."telegramId" IS NOT NULL
ON CONFLICT ("userId", "channelType") DO NOTHING;
