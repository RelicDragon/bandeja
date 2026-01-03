# User vs BasicUser Type Analysis

## Summary
This document analyzes all places in the frontend where `User` type is used and determines if they can be safely replaced with `BasicUser`.

## Type Definitions
- **BasicUser**: `id`, `firstName`, `lastName`, `avatar`, `level`, `socialLevel`, `gender`
- **User**: Extends BasicUser + many additional fields (phone, email, telegramId, telegramUsername, originalAvatar, authProvider, currentCity, reliability, totalPoints, gamesPlayed, gamesWon, language, timeFormat, weekStart, genderIsSet, isAdmin, isTrainer, canCreateTournament, canCreateLeague, preferredHandLeft, preferredHandRight, preferredCourtSideLeft, preferredCourtSideRight, sendTelegramMessages, sendTelegramInvites, sendTelegramDirectMessages, sendTelegramReminders, sendPushMessages, sendPushInvites, sendPushDirectMessages, sendPushReminders, wallet, blockedUserIds)

---

## Files that MUST use `User` (cannot be changed)

### 1. `Frontend/src/components/PlayerCardBottomSheet.tsx`
**Reason**: Uses many User-specific fields:
- `originalAvatar` (line 409, 442, 531)
- `telegramId`, `telegramUsername` (lines 451-455, 515, 604-626)
- `isTrainer` (line 599)
- `preferredHandLeft`, `preferredHandRight`, `preferredCourtSideLeft`, `preferredCourtSideRight` (lines 661-683)
- `reliability` (via stats.user)

### 2. `Frontend/src/pages/Profile.tsx`
**Reason**: Uses many User-specific fields:
- `email`, `genderIsSet`, `preferredHandLeft`, `preferredHandRight`, `preferredCourtSideLeft`, `preferredCourtSideRight`
- `language`, `timeFormat`, `weekStart`
- `wallet`, `originalAvatar`, `telegramUsername`
- `currentCity`, `blockedUserIds`

### 3. `Frontend/src/store/authStore.ts`
**Reason**: Stores the full authenticated user object, uses:
- `language`, `timeFormat`, `weekStart` (lines 55-70, 90-92, 128-130)

### 4. `Frontend/src/api/users.ts`
**Reason**: API returns full `User` objects. The `UserStats` interface includes `user: User & { isFavorite?: boolean }` which needs full User.

### 5. `Frontend/src/components/NotificationSettingsModal.tsx`
**Reason**: Uses notification settings fields:
- `sendTelegramMessages`, `sendTelegramInvites`, `sendTelegramDirectMessages`, `sendTelegramReminders`
- `sendPushMessages`, `sendPushInvites`, `sendPushDirectMessages`, `sendPushReminders`
- `telegramUsername` (line 215)

### 6. `Frontend/src/utils/userValidation.ts`
**Reason**: Uses User-specific fields:
- `currentCity` (line 15)
- `genderIsSet` (line 15)

### 7. `Frontend/src/utils/gameResults.ts`
**Reason**: Uses User-specific fields:
- `isAdmin` (lines 64, 165)
- `id` (used for permission checks)

### 8. `Frontend/src/api/ranking.ts`
**Reason**: `LeaderboardEntry extends User` and uses User-specific fields:
- `reliability`, `totalPoints`, `gamesPlayed`, `gamesWon` (lines 8-11)

### 9. `Frontend/src/utils/messageMenuUtils.ts`
**Reason**: Uses `resolveDisplaySettings(user)` which requires:
- `language`, `timeFormat`, `weekStart` (User-specific fields)

---

## Files that CAN use `BasicUser` (can be changed)

### 1. `Frontend/src/api/chat.ts`
**Current**: `sender: User | null` (line 31)
**Can change to**: `sender: BasicUser | null`
**Reason**: Only uses basic fields (id, firstName, lastName, avatar) for display. The `UserChat` interface already uses `BasicUser` for `user1` and `user2` (lines 79-80).

### 2. `Frontend/src/components/BlockedUsersSection.tsx`
**Current**: `blockedUser: User` (line 19)
**Can change to**: `blockedUser: BasicUser`
**Reason**: Only passes to `PlayerAvatar` which accepts `BasicUser` (line 89-95). Only uses `id`, `firstName`, `lastName` for display.

### 3. `Frontend/src/api/blockedUsers.ts`
**Current**: `blockedUser: User` (line 28)
**Can change to**: `blockedUser: BasicUser`
**Reason**: Only used in `BlockedUsersSection` which can use `BasicUser`.

### 4. `Frontend/src/components/createGame/ParticipantsSection.tsx`
**Current**: `user: User | null` (line 13)
**Can change to**: `user: BasicUser | null`
**Reason**: Only passes to `PlayerAvatar` which accepts `BasicUser` (line 47). Only uses `id` for comparison (line 43, 92).

### 5. `Frontend/src/components/gameResults/AvailablePlayersFooter.tsx`
**Current**: `players: User[]` (line 8)
**Can change to**: `players: BasicUser[]`
**Reason**: Only uses `id`, `firstName`, `lastName`, `avatar`, `level`, `gender` (lines 36-63). Converts to `GameParticipant` which uses `BasicUser`.

### 6. `Frontend/src/components/gameResults/FloatingDraggedPlayer.tsx`
**Current**: `player: User | null` (line 6)
**Can change to**: `player: BasicUser | null`
**Reason**: Only used for display, likely only uses basic fields.

### 7. `Frontend/src/components/GameDetails/GameResultsModals.tsx`
**Current**: `players: User[]` (line 16)
**Can change to**: `players: BasicUser[]`
**Reason**: Only used for player selection/display in game results.

### 8. `Frontend/src/components/gameResults/RoundCard.tsx`
**Current**: `players: User[]` (line 13)
**Can change to**: `players: BasicUser[]`
**Reason**: Only used for display in game results.

### 9. `Frontend/src/components/gameResults/HorizontalScoreEntryModal.tsx`
**Current**: `players: User[]` (line 13), `teamAPlayers`, `teamBPlayers` as `User[]` (lines 85-86)
**Can change to**: `players: BasicUser[]`
**Reason**: Only uses `id` to find players (lines 85-86).

### 10. `Frontend/src/components/SetResultModal.tsx`
**Current**: `players: User[]` (line 13), `teamAPlayers`, `teamBPlayers` as `User[]` (lines 85-86)
**Can change to**: `players: BasicUser[]`
**Reason**: Only uses `id` to find players.

### 11. `Frontend/src/components/gameResults/HorizontalMatchCard.tsx`
**Current**: `players: User[]` (line 9)
**Can change to**: `players: BasicUser[]`
**Reason**: Only used for display in match cards.

### 12. `Frontend/src/components/gameResults/MatchCard.tsx`
**Current**: `players: User[]` (line 9)
**Can change to**: `players: BasicUser[]`
**Reason**: Only used for display in match cards.

### 13. `Frontend/src/components/GameDetails/GameResults.tsx`
**Current**: `user?: User | null` (line 8)
**Can change to**: `user?: BasicUser | null` (if only used for permission checks by id)
**Note**: Need to verify if it uses `isAdmin` or other User-specific fields.

### 14. `Frontend/src/services/gameStandings.ts`
**Current**: `user: User` (line 5), `players` as `User[]` (line 143)
**Can change to**: `user: BasicUser`, `players: BasicUser[]`
**Reason**: Only uses `id` (line 152) and `gender` (lines 189-190) which are in BasicUser.

### 15. `Frontend/src/services/predefinedResults/twoOnTwo.ts`
**Current**: `players: User[]` (line 11)
**Can change to**: `players: BasicUser[]`
**Reason**: Only uses `id` (lines 19, 24, 25, 29, 30).

### 16. `Frontend/src/services/predefinedResults/oneOnOne.ts`
**Current**: `players: User[]` (likely similar to twoOnTwo)
**Can change to**: `players: BasicUser[]`
**Reason**: Only uses `id`.

### 17. `Frontend/src/services/roundGenerator.ts`
**Current**: `players` as `User[]` (line 54)
**Can change to**: `players: BasicUser[]`
**Reason**: Only uses basic user data.

### 18. `Frontend/src/utils/gameResultsHelpers.ts`
**Current**: `players: User[]` (line 53)
**Can change to**: `players: BasicUser[]`
**Reason**: Only uses basic user data for filtering/selection.

---

## Files that need verification

### 1. `Frontend/src/components/GameDetails/GameResults.tsx`
**Current**: `user?: User | null` (line 8)
**MUST keep as User**: Passes `user` to `getGameResultStatus()` which uses `isAdmin` (User-specific field).

### 2. `Frontend/src/types/index.ts`
**Note**: The `Bug` interface uses `User` for `sender` and `participants[].user` (lines 319, 324). 
**Analysis**: These are only used for display (firstName, lastName, avatar) in `BugCard` and `MentionInput`. They could potentially be `BasicUser`, but this would require backend API changes as well. Currently kept as `User` for API consistency.

---

## Inline Interfaces/Types That Could Use `BasicUser` or `User`

These are places where we define inline interfaces or types with user-related fields that could potentially use `BasicUser` or `User` instead.

### 1. `Frontend/src/components/MentionInput.tsx`
**Current**: `interface MentionableUser { id: string; display: string; firstName?: string; lastName?: string; avatar?: string; }` (lines 8-14)
**Could use**: `Pick<BasicUser, 'id' | 'firstName' | 'lastName' | 'avatar'> & { display: string }`
**Reason**: Only uses basic user fields. The `display` field is computed from firstName/lastName.

### 2. `Frontend/src/api/users.ts`
**Current**: 
- `PlayerComparison.otherUser: { id: string; firstName?: string; lastName?: string; avatar?: string; level: number; }` (lines 35-41)
- `PlayerComparison.gamesAgainstEachOther[].participants[].user: { id: string; firstName?: string; lastName?: string; avatar?: string; level: number; }` (lines 78-84)
- `InvitablePlayer: { id: string; firstName?: string; lastName?: string; avatar?: string; level: number; socialLevel: number; gender: Gender; telegramUsername?: string; interactionCount: number; }` (lines 125-135)

**Could use**:
- `otherUser`: `Pick<BasicUser, 'id' | 'firstName' | 'lastName' | 'avatar' | 'level'>`
- `participants[].user`: `Pick<BasicUser, 'id' | 'firstName' | 'lastName' | 'avatar' | 'level'>`
- `InvitablePlayer`: `BasicUser & { telegramUsername?: string; interactionCount: number; }` (extends BasicUser with additional fields)

**Reason**: These match BasicUser fields. `InvitablePlayer` has `telegramUsername` which is User-specific, but could extend BasicUser.

### 3. `Frontend/src/api/chat.ts`
**Current**: `ChatMessage.replyTo.sender: { id: string; firstName?: string; lastName?: string; }` (lines 25-29)
**Could use**: `Pick<BasicUser, 'id' | 'firstName' | 'lastName'>`
**Reason**: Only uses basic fields for display.

### 4. `Frontend/src/api/results.ts`
**Current**: 
- `OutcomeExplanation.teammates: Array<{ firstName?: string; lastName?: string; level: number }>` (line 159)
- `OutcomeExplanation.opponents: Array<{ firstName?: string; lastName?: string; level: number }>` (line 160)

**Could use**: `Array<Pick<BasicUser, 'firstName' | 'lastName' | 'level'>>`
**Reason**: Only uses basic fields.

### 5. `Frontend/src/components/OutcomeExplanationModal.tsx`
**Current**: `renderPlayerNames(players: Array<{ firstName?: string; lastName?: string; level: number }>)` (line 59)
**Could use**: `renderPlayerNames(players: Array<Pick<BasicUser, 'firstName' | 'lastName' | 'level'>>)`
**Reason**: Only uses basic fields.

### 6. `Frontend/src/utils/messageMenuUtils.ts`
**Current**: 
- `getUserDisplayName(user: { firstName?: string; lastName?: string })` (line 17)
- `getUserInitials(user: { firstName?: string; lastName?: string })` (line 28)

**Could use**: `Pick<BasicUser, 'firstName' | 'lastName'>` or just accept `BasicUser`
**Reason**: Only uses firstName and lastName which are in BasicUser.

### 7. `Frontend/src/api/transactions.ts`
**Current**: 
- `TransactionDetails.fromUser/toUser: { id: string; firstName?: string | null; lastName?: string | null; }` (lines 26-35)
- `Wallet: { userId: string; wallet: number; firstName?: string | null; lastName?: string | null; }` (lines 38-43)

**Could use**: 
- `fromUser/toUser`: `Pick<BasicUser, 'id' | 'firstName' | 'lastName'> | null` (note: null handling)
- `Wallet`: Separate interface (has `userId` instead of `id`, and `wallet` field)

**Reason**: Only uses basic fields. Note that `Wallet` has a different structure (`userId` vs `id`).

### 8. `Frontend/src/components/MessageInput.tsx`
**Current**: Inline object `{ id: 'system', firstName: 'System' }` (line 161)
**Note**: This is a fallback system user, not a real user. Could use `Pick<BasicUser, 'id' | 'firstName'>` but might be overkill for a one-off fallback.

### 9. `Frontend/src/api/auth.ts`
**Current**: Registration/login data objects with `firstName`, `lastName`, `gender`, etc. (lines 5-18, 28-44)
**Note**: These are input types for API requests, not user objects. They include fields like `phone`, `password`, `telegramId` which are not in User/BasicUser. Should remain as separate input types.

---

## Recommendation

1. **Keep `User`** in files that access User-specific fields (profile, settings, permissions, etc.)
2. **Change to `BasicUser`** in game results components and player display components that only need basic user info
3. **Verify** a few files that might use User-specific fields but aren't obvious

This will improve type safety and make it clearer which components need full user data vs just basic display info.

