# Bugs (in-app tracker)

Issue reporting as chat threads. Inbox is a Chats filter, not a separate product area.

## Model

Prisma `Bug` + `BugParticipant` + wrapping `GroupChannel` (`bugId`). Create (`bug.service.ts`): Bug row, public GroupChannel named from text, reporter `OWNER`, all other `isDeveloper` users as participants.

**Types** (`BugType`): `BUG` `CRITICAL` `SUGGESTION` `QUESTION` `TASK` `REVIEW`.

**Priority:** non-Review `-2…+2` (`clampTrackerPriority`). Review: `priority` holds **1–5 stars** (`isValidReviewStars`). Resolve: `bug/bugPriority.ts`.

**Status** (`BugStatus`): `CREATED` → `CONFIRMED` → `IN_PROGRESS` → `TEST` → `FINISHED` → `ARCHIVED`. Update stamps `testingStartedAt` on first `TEST`, `inProgressReachedAt` on first `IN_PROGRESS`, `finishedAt` on `FINISHED`.

Create from + menu (`BugModal`) → opens the bug channel.

## Chat wiring

- Inbox: `/bugs` (filter `bugs`). Thread: `/bugs/:id` where **id = GroupChannel.id**.
- REST entity: `/api/bugs/:id` = **Bug.id** (`bug.routes.ts`).
- Unread: `GROUP:{channelId}` + `groupChannelMeta.bugId` / `isChannel`.
- Socket for the GroupChannel thread: `group-{channelId}`. `new-bug` → `notify-developers`.
- Context panel in thread (`BugInfoPanel` / `BugContextPanel`): type, priority/stars, status.
- Join/leave: `POST /bugs/:id/join-chat` \| `leave-chat`.

See `docs/domains/chat.md` for GROUP vs leftover `ChatContextType.BUG`.

## Lifecycle scheduler

`bugArchivedScheduler.service.ts` — daily **04:30**.

| Step | Rule |
|------|------|
| `TEST` → `FINISHED` | `testingStartedAt` older than **15 days**; grants bug-shipped achievement |
| `FINISHED` → `ARCHIVED` | `finishedAt` older than **3 days** |

Manual status changes still allowed via `PUT /bugs/:id` (sender or admin).

## Routes

| Method | Path | |
|--------|------|--|
| `POST` | `/bugs` | create (`text`, `bugType`, optional `priority`) |
| `GET` | `/bugs` | list + filters |
| `GET` | `/bugs/:id` | Bug.id |
| `PUT` | `/bugs/:id` | status / type / priority |
| `DELETE` | `/bugs/:id` | |
| `POST` | `/bugs/:id/join-chat` | |
| `POST` | `/bugs/:id/leave-chat` | |

FE: `Frontend/src/api/bugs.ts`, `Frontend/src/components/bugs/`, inbox `chatInboxFeedFetch.ts` + `bugsFilterParams.ts`.

## Key paths

- `Backend/src/services/bug.service.ts`
- `Backend/src/services/bugArchivedScheduler.service.ts`
- `Backend/src/services/bug/bugPriority.ts`
- `Backend/src/services/chat/bugGroupChannelLookup.ts`
- `Backend/src/services/chat/authorizeBugRoomJoin.ts`
- `Backend/src/controllers/bug.controller.ts`
- `Backend/src/routes/bug.routes.ts`
- `Backend/src/services/push/notifications/new-bug-push.notification.ts`
- `Backend/src/services/telegram/notifications/new-bug.notification.ts`
