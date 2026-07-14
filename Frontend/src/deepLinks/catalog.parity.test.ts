import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ANDROID_SHORTCUT_ACTION_IDS,
  BANDEJA_HTTPS_ORIGIN,
  DEEP_LINK_ACTIONS,
  DEEP_LINK_TEMPLATES,
  FIND_TODAY_PATH,
  FIND_TOMORROW_PATH,
  absoluteBandejaUrl,
  buildFindPath,
  deepLinkActionUrl,
  serializeDeepLinkCatalogMirror,
  type AndroidShortcutId,
  type DeepLinkActionId,
  type DeepLinkCatalogMirror,
  type DeepLinkTemplateId,
} from './catalog';
import { resolveFindDayKey } from '@/utils/findDayFromSearchParams';

const FRONTEND_ROOT = join(process.cwd());
const MIRROR_PATH = join(FRONTEND_ROOT, 'src/deepLinks/catalog.mirror.json');
const IOS_DEEP_LINK_PATH = join(FRONTEND_ROOT, 'ios/App/App/BandejaDeepLink.swift');
const IOS_HOME_WIDGET_DEEP_LINK_PATH = join(
  FRONTEND_ROOT,
  'ios/App/BandejaHomeWidgets/HomeWidgetDeepLink.swift',
);
const ANDROID_SHORTCUTS_PATH = join(
  FRONTEND_ROOT,
  'android/app/src/main/res/xml/shortcuts.xml',
);
const ANDROID_WIDGET_DEEP_LINKS_PATH = join(
  FRONTEND_ROOT,
  'android/bandeja-widgets/src/main/java/com/funified/bandeja/widgets/WidgetDeepLinks.kt',
);
const ANDROID_DYNAMIC_SHORTCUTS_PATH = join(
  FRONTEND_ROOT,
  'android/app/src/main/java/com/funified/bandeja/widgets/DynamicGameShortcuts.java',
);
const ANDROID_NEXT_GAME_DEEP_LINK_PATH = join(
  FRONTEND_ROOT,
  'android/bandeja-widgets/src/main/java/com/funified/bandeja/widgets/NextGameDeepLink.kt',
);

const IOS_INTENT_PATHS = [
  join(FRONTEND_ROOT, 'ios/App/App/FindGamesIntent.swift'),
  join(FRONTEND_ROOT, 'ios/App/App/BandejaAssistantIntents.swift'),
  join(FRONTEND_ROOT, 'ios/App/App/CreateGameIntent.swift'),
  join(FRONTEND_ROOT, 'ios/App/App/OpenMyGamesIntent.swift'),
  join(FRONTEND_ROOT, 'ios/App/App/OpenNextGameIntent.swift'),
] as const;

const IOS_APP_SHORTCUTS_PATH = join(FRONTEND_ROOT, 'ios/App/App/BandejaAppShortcuts.swift');

const PRODUCTION_SCAN_ROOTS = [
  join(FRONTEND_ROOT, 'ios/App/App'),
  join(FRONTEND_ROOT, 'ios/App/BandejaHomeWidgets'),
  join(FRONTEND_ROOT, 'android/app/src/main'),
  join(FRONTEND_ROOT, 'android/bandeja-widgets/src/main'),
] as const;

const HTTPS_URL_RE = /https:\/\/bandeja\.me[^"'\s<>]*/g;

function readMirror(): DeepLinkCatalogMirror {
  return JSON.parse(readFileSync(MIRROR_PATH, 'utf8')) as DeepLinkCatalogMirror;
}

function sortedKeys(obj: Record<string, unknown>): string[] {
  return Object.keys(obj).slice().sort();
}

function extractIosStaticUrl(swift: string, name: string): string {
  const match = swift.match(
    new RegExp(`static\\s+let\\s+${name}\\s*=\\s*URL\\(string:\\s*"([^"]+)"\\)`),
  );
  if (!match?.[1]) {
    throw new Error(`missing static let ${name} URL`);
  }
  return match[1];
}

function extractIosBuilderUrlLiteral(swift: string, funcName: string): string {
  const match = swift.match(
    new RegExp(
      `static\\s+func\\s+${funcName}\\([^)]*\\)\\s*->\\s*URL\\s*\\{[\\s\\S]*?URL\\(string:\\s*"([^"]+)"\\)`,
    ),
  );
  if (!match?.[1]) {
    throw new Error(`missing ${funcName} URL builder`);
  }
  return match[1];
}

function extractAndroidShortcutUrl(xml: string, shortcutId: string): string {
  const shortcutMatch = xml.match(
    new RegExp(
      `<shortcut\\b[^>]*android:shortcutId="${shortcutId}"[^>]*>[\\s\\S]*?<\\/shortcut>`,
    ),
  );
  if (!shortcutMatch) {
    throw new Error(`shortcuts.xml: missing shortcut ${shortcutId}`);
  }
  const dataMatch = shortcutMatch[0].match(/android:data="([^"]+)"/);
  if (!dataMatch?.[1]) {
    throw new Error(`shortcuts.xml ${shortcutId}: missing android:data`);
  }
  return dataMatch[1].replace(/&amp;/g, '&');
}

function extractAndroidShortcutIds(xml: string): string[] {
  return [...xml.matchAll(/android:shortcutId="([^"]+)"/g)].map((m) => m[1]).sort();
}

function extractKotlinConst(kt: string, name: string): string {
  const match = kt.match(new RegExp(`const\\s+val\\s+${name}\\s*=\\s*"([^"]+)"`));
  if (!match?.[1]) {
    throw new Error(`WidgetDeepLinks.kt: missing const val ${name}`);
  }
  return match[1];
}

function extractKotlinNamedBuilder(kt: string, name: string): string {
  const match = kt.match(
    new RegExp(`fun\\s+${name}\\s*\\([^)]*\\)\\s*:\\s*String\\s*=\\s*"([^"]+)"`),
  );
  if (!match?.[1]) {
    throw new Error(`WidgetDeepLinks.kt: missing fun ${name} URL`);
  }
  return match[1];
}

function catalogUrlTemplateToSwift(urlTemplate: string): string {
  return urlTemplate.replace(/\{id\}/g, '\\(id)');
}

function catalogUrlTemplateToKotlin(urlTemplate: string): string {
  return urlTemplate.replace(/\{id\}/g, '$id');
}

function normalizeNativeHttpsUrl(raw: string): string {
  return raw
    .replace(/&amp;/g, '&')
    .replace(/\$id/g, '{id}')
    .replace(/\\\(id\)/g, '{id}');
}

function shouldSkipScanFile(absPath: string): boolean {
  const rel = relative(FRONTEND_ROOT, absPath);
  if (rel.includes('Watch')) return true;
  const base = absPath.split('/').pop() ?? '';
  if (base === 'NativeApiConfig.swift' || base === 'strings.xml') return true;
  if (base.endsWith('Test.kt') || base.endsWith('Tests.swift')) return true;
  return false;
}

function walkSourceFiles(dir: string, out: string[] = []): string[] {
  for (const ent of readdirSync(dir)) {
    const abs = join(dir, ent);
    const st = statSync(abs);
    if (st.isDirectory()) {
      if (ent === 'build' || ent === '.git') continue;
      walkSourceFiles(abs, out);
      continue;
    }
    if (!/\.(swift|kt|java|xml)$/.test(ent)) continue;
    if (shouldSkipScanFile(abs)) continue;
    out.push(abs);
  }
  return out;
}

function catalogAllowedHttpsUrls(): Set<string> {
  const urls = new Set<string>();
  for (const id of Object.keys(DEEP_LINK_ACTIONS) as DeepLinkActionId[]) {
    urls.add(deepLinkActionUrl(id));
  }
  for (const id of Object.keys(DEEP_LINK_TEMPLATES) as DeepLinkTemplateId[]) {
    urls.add(absoluteBandejaUrl(DEEP_LINK_TEMPLATES[id].pathTemplate));
  }
  return urls;
}

describe('deep-link catalog (#278)', () => {
  it('TS SoT matches committed JSON mirror', () => {
    expect(serializeDeepLinkCatalogMirror()).toEqual(readMirror());
  });

  it('find builders stay locked to catalog paths', () => {
    expect(buildFindPath({ view: 'calendar', dayOffset: 0 })).toBe(FIND_TODAY_PATH);
    expect(buildFindPath({ view: 'calendar', dayOffset: 1 })).toBe(FIND_TOMORROW_PATH);
    expect(DEEP_LINK_ACTIONS.findToday.path).toBe(FIND_TODAY_PATH);
    expect(DEEP_LINK_ACTIONS.findTomorrow.path).toBe(FIND_TOMORROW_PATH);
  });

  it('every named action and template is mirrored exactly', () => {
    const mirror = readMirror();
    expect(sortedKeys(mirror.actions)).toEqual(sortedKeys(DEEP_LINK_ACTIONS));
    expect(sortedKeys(mirror.templates)).toEqual(sortedKeys(DEEP_LINK_TEMPLATES));
    for (const id of Object.keys(DEEP_LINK_ACTIONS) as DeepLinkActionId[]) {
      expect(mirror.actions[id]).toEqual({
        path: DEEP_LINK_ACTIONS[id].path,
        url: deepLinkActionUrl(id),
      });
    }
    for (const id of Object.keys(DEEP_LINK_TEMPLATES) as DeepLinkTemplateId[]) {
      const pathTemplate = DEEP_LINK_TEMPLATES[id].pathTemplate;
      expect(mirror.templates[id]).toEqual({
        pathTemplate,
        urlTemplate: absoluteBandejaUrl(pathTemplate),
      });
      expect(mirror.templates[id].urlTemplate.startsWith(BANDEJA_HTTPS_ORIGIN)).toBe(true);
    }
  });

  it('iOS BandejaDeepLink exposes every catalog action + template', () => {
    const swift = readFileSync(IOS_DEEP_LINK_PATH, 'utf8');
    const mirror = readMirror();
    for (const id of Object.keys(DEEP_LINK_ACTIONS) as DeepLinkActionId[]) {
      expect(extractIosStaticUrl(swift, id)).toBe(deepLinkActionUrl(id));
    }
    for (const id of Object.keys(DEEP_LINK_TEMPLATES) as DeepLinkTemplateId[]) {
      expect(extractIosBuilderUrlLiteral(swift, id)).toBe(
        catalogUrlTemplateToSwift(mirror.templates[id].urlTemplate),
      );
    }
    expect(swift).not.toMatch(/https:\/\/bandeja\.me\/find"/);
  });

  it('iOS HomeWidgetDeepLink matches catalog myGames / login / game', () => {
    const swift = readFileSync(IOS_HOME_WIDGET_DEEP_LINK_PATH, 'utf8');
    expect(extractIosStaticUrl(swift, 'home')).toBe(deepLinkActionUrl('myGames'));
    expect(extractIosStaticUrl(swift, 'login')).toBe(deepLinkActionUrl('login'));
    expect(extractIosBuilderUrlLiteral(swift, 'game')).toBe(
      catalogUrlTemplateToSwift(readMirror().templates.game.urlTemplate),
    );
  });

  it('iOS Assistant intents use BandejaDeepLink only (no hardcoded HTTPS)', () => {
    for (const path of IOS_INTENT_PATHS) {
      const src = readFileSync(path, 'utf8');
      expect(src).toMatch(/BandejaDeepLink/);
      expect(src).not.toMatch(/https:\/\/bandeja\.me/);
    }
    const findGames = readFileSync(IOS_INTENT_PATHS[0], 'utf8');
    const assistant = readFileSync(IOS_INTENT_PATHS[1], 'utf8');
    const createGame = readFileSync(IOS_INTENT_PATHS[2], 'utf8');
    const myGames = readFileSync(IOS_INTENT_PATHS[3], 'utf8');
    const nextGame = readFileSync(IOS_INTENT_PATHS[4], 'utf8');
    const appShortcuts = readFileSync(IOS_APP_SHORTCUTS_PATH, 'utf8');
    expect(findGames).toMatch(/BandejaDeepLink\.open\(\s*BandejaDeepLink\.findToday\s*\)/);
    // Siri App Shortcut phrases for Find must keep findToday path (#274); sole owner (#279)
    expect(appShortcuts).toMatch(/intent:\s*FindGamesIntent\(\)/);
    expect(appShortcuts).not.toMatch(/FindGamesTodayIntent\s*\(/);
    expect(assistant).not.toMatch(/struct\s+FindGamesTodayIntent\b/);
    expect(createGame).toMatch(/BandejaDeepLink\.open\(\s*BandejaDeepLink\.createGame\s*\)/);
    expect(myGames).toMatch(/BandejaDeepLink\.open\(\s*BandejaDeepLink\.myGames\s*\)/);
    expect(nextGame).toMatch(/BandejaDeepLink\.(game|nextGame)/);
    expect(assistant).toMatch(
      /struct FindGamesTomorrowIntent[\s\S]*?BandejaDeepLink\.open\(\s*BandejaDeepLink\.findTomorrow\s*\)/,
    );
    expect(assistant).toMatch(
      /struct OpenChatsIntent[\s\S]*?BandejaDeepLink\.open\(\s*BandejaDeepLink\.chats\s*\)/,
    );
    expect(assistant).toMatch(
      /struct OpenInvitesIntent[\s\S]*?BandejaDeepLink\.open\(\s*BandejaDeepLink\.invites\s*\)/,
    );
    expect(assistant).toMatch(
      /struct CreateLeagueIntent[\s\S]*?BandejaDeepLink\.open\(\s*BandejaDeepLink\.createLeague\s*\)/,
    );
    expect(assistant).toMatch(
      /struct OpenNextGameChatIntent[\s\S]*?BandejaDeepLink\.(gameChat|nextGameChat)/,
    );
    expect(assistant).toMatch(
      /struct OpenNextGameLiveIntent[\s\S]*?BandejaDeepLink\.(gameLive|nextGameLive)/,
    );
  });

  it('Android shortcuts map 1:1 onto catalog actions', () => {
    const xml = readFileSync(ANDROID_SHORTCUTS_PATH, 'utf8');
    expect(extractAndroidShortcutIds(xml)).toEqual(sortedKeys(ANDROID_SHORTCUT_ACTION_IDS));
    for (const shortcutId of Object.keys(
      ANDROID_SHORTCUT_ACTION_IDS,
    ) as AndroidShortcutId[]) {
      const actionId = ANDROID_SHORTCUT_ACTION_IDS[shortcutId];
      expect(extractAndroidShortcutUrl(xml, shortcutId)).toBe(deepLinkActionUrl(actionId));
    }
    const match = xml.match(
      /<capability\b[^>]*android:name="actions\.intent\.OPEN_APP_FEATURE"[\s\S]*?url-template\s+android:value="([^"]+)"/,
    );
    if (!match?.[1]) {
      throw new Error('shortcuts.xml: missing OPEN_APP_FEATURE url-template');
    }
    expect(match[1]).toBe(deepLinkActionUrl('myGames'));
  });

  it('Android WidgetDeepLinks match catalog static + template URLs', () => {
    const kt = readFileSync(ANDROID_WIDGET_DEEP_LINKS_PATH, 'utf8');
    const mirror = readMirror();
    expect(extractKotlinConst(kt, 'HOME')).toBe(deepLinkActionUrl('myGames'));
    expect(extractKotlinConst(kt, 'LOGIN')).toBe(deepLinkActionUrl('login'));
    expect(extractKotlinConst(kt, 'NEXT_GAME')).toBe(deepLinkActionUrl('nextGame'));
    expect(extractKotlinConst(kt, 'NEXT_GAME_CHAT')).toBe(deepLinkActionUrl('nextGameChat'));
    expect(extractKotlinConst(kt, 'NEXT_GAME_LIVE')).toBe(deepLinkActionUrl('nextGameLive'));
    for (const id of Object.keys(DEEP_LINK_TEMPLATES) as DeepLinkTemplateId[]) {
      expect(extractKotlinNamedBuilder(kt, id)).toBe(
        catalogUrlTemplateToKotlin(mirror.templates[id].urlTemplate),
      );
    }
  });

  it('Android DynamicGameShortcuts / NextGameDeepLink use WidgetDeepLinks', () => {
    const java = readFileSync(ANDROID_DYNAMIC_SHORTCUTS_PATH, 'utf8');
    expect(java).toMatch(/WidgetDeepLinks\.game\(/);
    expect(java).not.toMatch(/https:\/\/bandeja\.me/);
    const nextGame = readFileSync(ANDROID_NEXT_GAME_DEEP_LINK_PATH, 'utf8');
    expect(nextGame).toMatch(/WidgetDeepLinks\.game/);
    expect(nextGame).not.toMatch(/https:\/\/bandeja\.me/);
  });

  it('no production assistant/widget HTTPS URL outside catalog', () => {
    const allowed = catalogAllowedHttpsUrls();
    const unmapped: string[] = [];
    for (const root of PRODUCTION_SCAN_ROOTS) {
      for (const file of walkSourceFiles(root)) {
        const text = readFileSync(file, 'utf8').replace(/https:\/\/bandeja\.me\/api[^\s"']*/g, '');
        for (const raw of text.match(HTTPS_URL_RE) ?? []) {
          const url = normalizeNativeHttpsUrl(raw);
          if (!allowed.has(url)) {
            unmapped.push(`${relative(FRONTEND_ROOT, file)}: ${url}`);
          }
        }
      }
    }
    expect(unmapped).toEqual([]);
  });

  it('catalog findToday / findTomorrow resolve calendar day offsets', () => {
    const ref = new Date('2026-07-14T15:30:00');
    for (const [id, offset] of [
      ['findToday', '0'],
      ['findTomorrow', '1'],
    ] as const) {
      const url = new URL(deepLinkActionUrl(id));
      expect(url.pathname).toBe('/find');
      expect(url.searchParams.get('view')).toBe('calendar');
      expect(
        resolveFindDayKey(
          {
            date: url.searchParams.get('date'),
            dayOffset: url.searchParams.get('dayOffset'),
          },
          ref,
        ),
      ).toBe(resolveFindDayKey({ dayOffset: offset }, ref));
    }
  });
});
