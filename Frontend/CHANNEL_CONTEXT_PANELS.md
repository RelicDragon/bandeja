# Channel Context Panels Architecture

## Overview
Refactored the GroupChannelSettings component to use a modular, context-aware panel system. Each context type (bug, group, market item, etc.) now has its own dedicated component.

## Structure

```
src/components/chat/panels/
├── index.ts                    # Exports all panel components
├── ChannelContextPanel.tsx     # Context-aware wrapper (router)
├── GroupInfoPanel.tsx          # Avatar & name for regular groups/channels
└── BugInfoPanel.tsx            # Bug information & management
```

## Components

### 1. **ChannelContextPanel** (Router)
The main wrapper component that determines which panel to display based on channel context.

**Logic:**
- Bug chat (`groupChannel.bug`) → Shows `BugInfoPanel`
- Market item chat (`groupChannel.marketItem`) → Shows `MarketItemInfoPanel` (future)
- Default → Shows `GroupInfoPanel`

**Props:**
- All props needed by child components
- Intelligently passes relevant props to the appropriate panel

**Usage:**
```tsx
<ChannelContextPanel
  groupChannel={groupChannelData}
  name={name}
  setName={setName}
  canEdit={canEdit}
  isSavingName={isSavingName}
  nameError={nameError}
  setNameError={setNameError}
  onSaveName={handleSaveName}
  onAvatarUpload={handleAvatarUpload}
  onAvatarRemove={handleAvatarRemove}
  canEditBug={canEditBug}
  onUpdate={onUpdate}
/>
```

### 2. **GroupInfoPanel** (Regular Groups/Channels)
Displays avatar and name editor for standard groups and channels.

**Features:**
- Avatar upload/remove functionality
- Editable group/channel name (for owners/admins)
- Read-only name display (for regular participants)
- Name validation with error display
- Character counter (max 100)

**Props:**
```tsx
interface GroupInfoPanelProps {
  groupChannel: GroupChannel;
  name: string;
  setName: (name: string) => void;
  canEdit: boolean;
  isSavingName: boolean;
  nameError: string | null;
  setNameError: (error: string | null) => void;
  onSaveName: () => void;
  onAvatarUpload: (file: File) => Promise<void>;
  onAvatarRemove: () => Promise<void>;
}
```

### 3. **BugInfoPanel** (Bug Chats)
Displays bug information with admin management controls.

**Features:**
- Full bug text display with type icon
- **For admins:** Interactive selectors for bug type and status
- **For users:** Read-only type and status badges
- Color-coded badges for quick visual identification
- Real-time updates via API
- Loading states and toast notifications
- Internal state management (maintains own bug data)

**Props:**
```tsx
interface BugInfoPanelProps {
  bug: Bug;
  canEdit: boolean;
  onUpdate?: () => void;
}
```

**Bug Types:**
- 🔴 CRITICAL
- 🟠 BUG
- 🔵 SUGGESTION
- 🟣 QUESTION
- 🟢 TASK

**Bug Statuses:**
- CREATED (gray)
- CONFIRMED (blue)
- IN_PROGRESS (yellow)
- TEST (purple)
- FINISHED (green)
- ARCHIVED (gray)

## Benefits of This Architecture

### ✅ **Modularity**
- Each panel is self-contained
- Easy to test and maintain
- Clear separation of concerns

### ✅ **Extensibility**
- Adding new context types is simple:
  1. Create new panel component (e.g., `MarketItemInfoPanel.tsx`)
  2. Add routing logic to `ChannelContextPanel`
  3. Done!

### ✅ **Reusability**
- Panels can be used in other parts of the app
- Props are well-defined and documented
- No tight coupling to parent component

### ✅ **Maintainability**
- Bug fixes only affect relevant panel
- No massive conditional logic in parent
- Easier code review and debugging

### ✅ **Type Safety**
- TypeScript interfaces for all props
- Compile-time validation
- Better IDE autocomplete

## Future Extensions

### Market Item Panel
```tsx
// src/components/chat/panels/MarketItemInfoPanel.tsx
export const MarketItemInfoPanel = ({ item, ... }) => {
  // Display item details, price, images, etc.
};
```

Then add to `ChannelContextPanel`:
```tsx
if (isMarketItemChat && groupChannel.marketItem) {
  return <MarketItemInfoPanel item={groupChannel.marketItem} />;
}
```

### Game Event Panel
For game-related group chats (future):
```tsx
// src/components/chat/panels/GameEventInfoPanel.tsx
export const GameEventInfoPanel = ({ game, ... }) => {
  // Display game details, participants, schedule, etc.
};
```

## Integration

Used in `GroupChannelSettings.tsx`:
```tsx
<ChannelContextPanel
  groupChannel={groupChannelData}
  // ... other props
/>
```

The panel replaces the avatar/name section at the top of the settings page, providing context-specific information instead.

## Code Reduction

**Before:**
- 140+ lines of conditional JSX in GroupChannelSettings
- All helper functions inline
- Complex nested conditionals
- Hard to read and maintain

**After:**
- 12 lines for ChannelContextPanel usage
- Clean, modular components
- Easy to extend
- Clear responsibilities

## Summary

This architecture provides a clean, scalable solution for displaying context-specific information in group/channel settings. Each context type has its own dedicated component, making the codebase more maintainable and easier to extend with new features.
