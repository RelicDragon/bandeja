import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ANDROID_SHORTCUT_ACTION_IDS,
  DEEP_LINK_ACTIONS,
  DEEP_LINK_TEMPLATES,
  type DeepLinkActionId,
} from './catalog';
import {
  ASSISTANT_FEATURE_ACTIONS,
  ASSISTANT_GAME_ENTITY_ACTIONS,
  IOS_APP_SHORTCUT_MAX,
  androidFeatureShortcutIds,
  assertAndroidFeatureShortcutParity,
  iosAppShortcutPriorityList,
} from './assistantRegistry';

const FRONTEND_ROOT = join(process.cwd());
const IOS_APP_SHORTCUTS_PATH = join(FRONTEND_ROOT, 'ios/App/App/BandejaAppShortcuts.swift');
const IOS_ASSISTANT_INTENTS_PATH = join(
  FRONTEND_ROOT,
  'ios/App/App/BandejaAssistantIntents.swift',
);
const IOS_FIND_GAMES_PATH = join(FRONTEND_ROOT, 'ios/App/App/FindGamesIntent.swift');
const ANDROID_DYNAMIC_SHORTCUTS_PATH = join(
  FRONTEND_ROOT,
  'android/app/src/main/java/com/funified/bandeja/widgets/DynamicGameShortcuts.java',
);
const ANDROID_SHORTCUTS_PATH = join(
  FRONTEND_ROOT,
  'android/app/src/main/res/xml/shortcuts.xml',
);
const IOS_WIDGET_BRIDGE_PATH = join(FRONTEND_ROOT, 'ios/App/App/WidgetBridgePlugin.swift');
const IOS_GAME_ENTITY_PATH = join(FRONTEND_ROOT, 'ios/App/App/BandejaGameEntity.swift');
const IOS_NEXT_GAME_PICKER_PATH = join(
  FRONTEND_ROOT,
  'ios/App/BandejaNextGames/Sources/BandejaNextGames/NextGamePicker.swift',
);

function extractAppShortcutIntentNames(swift: string): string[] {
  return [...swift.matchAll(/intent:\s*([A-Za-z0-9_]+)\(\)/g)].map((m) => m[1]);
}

describe('assistant action registry (#279)', () => {
  it('names feature vs gameEntity layers once with catalog ids', () => {
    expect(ASSISTANT_FEATURE_ACTIONS.every((a) => a.layer === 'feature')).toBe(true);
    expect(ASSISTANT_GAME_ENTITY_ACTIONS.every((a) => a.layer === 'gameEntity')).toBe(true);

    for (const action of ASSISTANT_FEATURE_ACTIONS) {
      expect(action.id in DEEP_LINK_ACTIONS).toBe(true);
    }
    for (const action of ASSISTANT_GAME_ENTITY_ACTIONS) {
      expect(action.id in DEEP_LINK_TEMPLATES).toBe(true);
    }
    expect(
      ASSISTANT_GAME_ENTITY_ACTIONS.find((a) => a.id === 'game')?.androidDynamic,
    ).toBe(true);
    expect(
      ASSISTANT_GAME_ENTITY_ACTIONS.filter((a) => a.id !== 'game').every(
        (a) => a.androidDynamic === false,
      ),
    ).toBe(true);
  });

  it('collapses findToday to a single intent (no FindGamesTodayIntent)', () => {
    const findOwners = ASSISTANT_FEATURE_ACTIONS.filter((a) => a.id === 'findToday');
    expect(findOwners).toHaveLength(1);
    expect(findOwners[0]?.iosIntent).toBe('FindGamesIntent');

    const assistant = readFileSync(IOS_ASSISTANT_INTENTS_PATH, 'utf8');
    const findGames = readFileSync(IOS_FIND_GAMES_PATH, 'utf8');
    const appShortcuts = readFileSync(IOS_APP_SHORTCUTS_PATH, 'utf8');
    expect(assistant).not.toMatch(/struct\s+FindGamesTodayIntent\b/);
    expect(findGames).not.toMatch(/struct\s+FindGamesTodayIntent\b/);
    expect(appShortcuts).not.toMatch(/FindGamesTodayIntent\s*\(/);
    expect(findGames).toMatch(/BandejaDeepLink\.open\(\s*BandejaDeepLink\.findToday\s*\)/);
  });

  it('keeps game-entity intents distinct from feature next-game intents', () => {
    const featureIntents = new Set(ASSISTANT_FEATURE_ACTIONS.map((a) => a.iosIntent));
    const entityIntents = new Set(ASSISTANT_GAME_ENTITY_ACTIONS.map((a) => a.iosIntent));
    for (const intent of entityIntents) {
      expect(featureIntents.has(intent)).toBe(false);
    }

    const assistant = readFileSync(IOS_ASSISTANT_INTENTS_PATH, 'utf8');
    expect(assistant).toMatch(
      /struct OpenNextGameChatIntent[\s\S]*?BandejaDeepLink\.(gameChat|nextGameChat)/,
    );
    expect(assistant).toMatch(
      /struct OpenNextGameLiveIntent[\s\S]*?BandejaDeepLink\.(gameLive|nextGameLive)/,
    );
    expect(assistant).toMatch(
      /struct OpenGameIntent[\s\S]*?var game:\s*BandejaGameEntity\b/,
    );
    expect(assistant).toMatch(
      /struct OpenGameChatIntent[\s\S]*?var game:\s*BandejaGameEntity\b/,
    );
    expect(assistant).toMatch(
      /struct OpenLiveScoringIntent[\s\S]*?var game:\s*BandejaGameEntity\b/,
    );
    // Entity intents must not optional-fallback into feature URLs.
    expect(assistant).not.toMatch(
      /struct OpenGameChatIntent[\s\S]*?var game:\s*BandejaGameEntity\?/,
    );
  });

  it('App Shortcuts stay within Apple’s 10-slot cap with intentional priority', () => {
    const list = iosAppShortcutPriorityList();
    expect(list.length).toBeLessThanOrEqual(IOS_APP_SHORTCUT_MAX);
    expect(list.map((e) => e.priority)).toEqual(
      [...list.map((e) => e.priority)].sort((a, b) => a - b),
    );
    expect(new Set(list.map((e) => e.priority)).size).toBe(list.length);

    const appShortcuts = readFileSync(IOS_APP_SHORTCUTS_PATH, 'utf8');
    const donated = extractAppShortcutIntentNames(appShortcuts);
    expect(donated).toHaveLength(list.length);
    expect(donated).toEqual(list.map((e) => e.iosIntent));

    // CreateLeague + entity chat/live are intentional exclusions from donation.
    expect(donated).not.toContain('CreateLeagueIntent');
    expect(donated).not.toContain('OpenGameChatIntent');
    expect(donated).not.toContain('OpenLiveScoringIntent');
  });

  it('Android OPEN_APP_FEATURE synonyms map only onto feature catalog actions', () => {
    assertAndroidFeatureShortcutParity();
    const featureShortcutIds = androidFeatureShortcutIds().slice().sort();
    expect(featureShortcutIds).toEqual(Object.keys(ANDROID_SHORTCUT_ACTION_IDS).sort());

    for (const action of ASSISTANT_FEATURE_ACTIONS) {
      if (action.androidShortcutId == null) continue;
      const mapped = ANDROID_SHORTCUT_ACTION_IDS[action.androidShortcutId];
      expect(mapped).toBe(action.id);
      expect(action.id in DEEP_LINK_ACTIONS).toBe(true);
    }

    const xml = readFileSync(ANDROID_SHORTCUTS_PATH, 'utf8');
    expect(xml).toMatch(/actions\.intent\.OPEN_APP_FEATURE/);
    // No dyn_game_* shortcutIds in static feature shortcuts.
    expect(xml).not.toMatch(/android:shortcutId="dyn_game_/);

    const java = readFileSync(ANDROID_DYNAMIC_SHORTCUTS_PATH, 'utf8');
    expect(java).toMatch(/ID_PREFIX\s*=\s*"dyn_game_"/);
    expect(java).toMatch(/WidgetDeepLinks\.game\(/);
    // Atomic replace — open-game entity only (chat/live are feature static shortcuts)
    expect(java).toMatch(/ShortcutManagerCompat\.setDynamicShortcuts\(/);
    expect(java).not.toMatch(/removeAllDynamicShortcuts/);
    expect(java).not.toMatch(/WidgetDeepLinks\.gameChat/);
    expect(java).not.toMatch(/WidgetDeepLinks\.gameLive/);
  });

  it('refreshes iOS App Shortcut entities after envelope sync (reliability)', () => {
    const bridge = readFileSync(IOS_WIDGET_BRIDGE_PATH, 'utf8');
    expect(bridge).toMatch(/BandejaAppShortcuts\.updateAppShortcutParameters\(\)/);
    expect(bridge).toMatch(/func\s+syncNextGames[\s\S]*?reloadHomeWidgetsAndAssistant\(\)/);
    expect(bridge).toMatch(/func\s+clearNextGames[\s\S]*?reloadHomeWidgetsAndAssistant\(\)/);

    const picker = readFileSync(IOS_NEXT_GAME_PICKER_PATH, 'utf8');
    expect(picker).toMatch(/func\s+listDisplayable\(/);

    const entity = readFileSync(IOS_GAME_ENTITY_PATH, 'utf8');
    expect(entity).toMatch(/NextGamePicker\.listDisplayable/);
    expect(entity).toMatch(/isAuthenticated/);
    expect(entity).toMatch(/displayableEntities/);
  });

  it('feature catalog coverage excludes login-only / entity templates', () => {
    const featureIds = new Set(ASSISTANT_FEATURE_ACTIONS.map((a) => a.id));
    const required: DeepLinkActionId[] = [
      'findToday',
      'findTomorrow',
      'myGames',
      'createGame',
      'createLeague',
      'nextGame',
      'nextGameChat',
      'nextGameLive',
      'chats',
      'invites',
    ];
    for (const id of required) {
      expect(featureIds.has(id)).toBe(true);
    }
    expect(featureIds.has('login')).toBe(false);
  });
});
