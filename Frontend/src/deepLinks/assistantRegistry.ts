/**
 * Assistant action registry (#279) — explicit two-layer surface tied to epic #272.
 *
 * Layer 1 — feature: static catalog deep links (Find, My, create, chats, invites, next-game*).
 * Layer 2 — gameEntity: game-scoped templates (open / chat / live) via iOS AppEntity
 *           and Android dynamic launcher shortcuts.
 *
 * App Shortcuts: Apple max 10 donated shortcuts. Priority list below is intentional;
 * CreateLeague + entity chat/live stay AppIntents (Shortcuts library) but are not donated.
 */

import {
  ANDROID_SHORTCUT_ACTION_IDS,
  type AndroidShortcutId,
  type DeepLinkActionId,
  type DeepLinkTemplateId,
} from './catalog';

export const IOS_APP_SHORTCUT_MAX = 10 as const;

export type AssistantLayer = 'feature' | 'gameEntity';

export type AssistantFeatureAction = {
  layer: 'feature';
  id: DeepLinkActionId;
  /** Swift `AppIntent` type name. */
  iosIntent: string;
  /** Android static shortcutId, or null when feature is iOS-only / Cap-only. */
  androidShortcutId: AndroidShortcutId | null;
  /**
   * 1…IOS_APP_SHORTCUT_MAX when donated via `BandejaAppShortcuts`.
   * null = AppIntent available, not an App Shortcut phrase target.
   */
  appShortcutPriority: number | null;
};

export type AssistantGameEntityAction = {
  layer: 'gameEntity';
  id: DeepLinkTemplateId;
  iosIntent: string;
  /**
   * true → Android `DynamicGameShortcuts` (`dyn_game_*` open-game only).
   * false → iOS AppEntity / Shortcuts library only (Android chat/live use feature static shortcuts).
   */
  androidDynamic: boolean;
  appShortcutPriority: number | null;
};

/**
 * Feature layer — one intent per catalog action (no URL-alias duplicates).
 * `findToday` is owned solely by `FindGamesIntent` (no FindGamesTodayIntent).
 */
export const ASSISTANT_FEATURE_ACTIONS = [
  {
    layer: 'feature',
    id: 'findToday',
    iosIntent: 'FindGamesIntent',
    androidShortcutId: 'find_games',
    appShortcutPriority: 1,
  },
  {
    layer: 'feature',
    id: 'findTomorrow',
    iosIntent: 'FindGamesTomorrowIntent',
    androidShortcutId: 'find_tomorrow',
    appShortcutPriority: 2,
  },
  {
    layer: 'feature',
    id: 'myGames',
    iosIntent: 'OpenMyGamesIntent',
    androidShortcutId: 'my_games',
    appShortcutPriority: 3,
  },
  {
    layer: 'feature',
    id: 'nextGame',
    iosIntent: 'OpenNextGameIntent',
    androidShortcutId: 'next_game',
    appShortcutPriority: 4,
  },
  {
    layer: 'feature',
    id: 'createGame',
    iosIntent: 'CreateGameIntent',
    androidShortcutId: 'create_game',
    appShortcutPriority: 5,
  },
  {
    layer: 'feature',
    id: 'nextGameChat',
    iosIntent: 'OpenNextGameChatIntent',
    androidShortcutId: 'game_chat',
    appShortcutPriority: 7,
  },
  {
    layer: 'feature',
    id: 'nextGameLive',
    iosIntent: 'OpenNextGameLiveIntent',
    androidShortcutId: 'live_scoring',
    appShortcutPriority: 8,
  },
  {
    layer: 'feature',
    id: 'chats',
    iosIntent: 'OpenChatsIntent',
    androidShortcutId: 'chats',
    appShortcutPriority: 9,
  },
  {
    layer: 'feature',
    id: 'invites',
    iosIntent: 'OpenInvitesIntent',
    androidShortcutId: 'invites',
    appShortcutPriority: 10,
  },
  {
    layer: 'feature',
    id: 'createLeague',
    iosIntent: 'CreateLeagueIntent',
    androidShortcutId: 'create_league',
    appShortcutPriority: null,
  },
] as const satisfies readonly AssistantFeatureAction[];

/**
 * Game-entity layer — parameterized by `BandejaGameEntity` / Android dyn_game_*.
 * Distinct from feature next-game* URLs and static OPEN_APP_FEATURE shortcuts.
 */
export const ASSISTANT_GAME_ENTITY_ACTIONS = [
  {
    layer: 'gameEntity',
    id: 'game',
    iosIntent: 'OpenGameIntent',
    androidDynamic: true,
    appShortcutPriority: 6,
  },
  {
    layer: 'gameEntity',
    id: 'gameChat',
    iosIntent: 'OpenGameChatIntent',
    androidDynamic: false,
    /** Not donated — Shortcuts library / entity param; feature chat uses OpenNextGameChatIntent. */
    appShortcutPriority: null,
  },
  {
    layer: 'gameEntity',
    id: 'gameLive',
    iosIntent: 'OpenLiveScoringIntent',
    androidDynamic: false,
    appShortcutPriority: null,
  },
] as const satisfies readonly AssistantGameEntityAction[];

export type AssistantFeatureActionId = (typeof ASSISTANT_FEATURE_ACTIONS)[number]['id'];
export type AssistantGameEntityActionId = (typeof ASSISTANT_GAME_ENTITY_ACTIONS)[number]['id'];

export type IosAppShortcutEntry =
  | {
      layer: 'feature';
      priority: number;
      iosIntent: string;
      catalogId: DeepLinkActionId;
    }
  | {
      layer: 'gameEntity';
      priority: number;
      iosIntent: string;
      catalogId: DeepLinkTemplateId;
    };

/** Donated App Shortcuts in priority order (must be ≤ IOS_APP_SHORTCUT_MAX). */
export function iosAppShortcutPriorityList(): IosAppShortcutEntry[] {
  const entries: IosAppShortcutEntry[] = [];
  for (const action of ASSISTANT_FEATURE_ACTIONS) {
    if (action.appShortcutPriority == null) continue;
    entries.push({
      layer: 'feature',
      priority: action.appShortcutPriority,
      iosIntent: action.iosIntent,
      catalogId: action.id,
    });
  }
  for (const action of ASSISTANT_GAME_ENTITY_ACTIONS) {
    if (action.appShortcutPriority == null) continue;
    entries.push({
      layer: 'gameEntity',
      priority: action.appShortcutPriority,
      iosIntent: action.iosIntent,
      catalogId: action.id,
    });
  }
  return entries.sort((a, b) => a.priority - b.priority);
}

/** Android static shortcutIds that fulfill OPEN_APP_FEATURE → catalog feature actions. */
export function androidFeatureShortcutIds(): AndroidShortcutId[] {
  return ASSISTANT_FEATURE_ACTIONS.map((a) => a.androidShortcutId).filter(
    (id): id is AndroidShortcutId => id != null,
  );
}

/** Sanity: every Android feature shortcut in the registry maps through ANDROID_SHORTCUT_ACTION_IDS. */
export function assertAndroidFeatureShortcutParity(): void {
  for (const shortcutId of androidFeatureShortcutIds()) {
    if (!(shortcutId in ANDROID_SHORTCUT_ACTION_IDS)) {
      throw new Error(`assistant registry: unknown Android shortcut ${shortcutId}`);
    }
  }
}
