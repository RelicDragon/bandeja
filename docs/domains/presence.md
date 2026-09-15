# Presence

In-memory online map (`presence.service.ts`). Activity TTL 2 min; expiry loop 30s. `recordActivity` on authenticated traffic; socket notifier online/offline.

Clients subscribe via Socket.IO. Privacy: `user.showOnlineStatus === false` skips subscribe/broadcast on FE (`socketEventsStore`, `useParticipantsOnlineCount`). Admin Online Users list uses `getAllOnlineUserIds`.
