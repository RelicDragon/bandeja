/**
 * CI guard for the i18n namespace split. Rules: `docs/product/constraints.md`
 * → "i18n namespaces". Runs under `npm run test:i18n-parity`.
 *
 * 1. Default bundle: the shallow spread in `locales/<lng>/index.ts` silently
 *    replaces a whole subtree when two files share a top-level key. Every
 *    top-level key of the flat `translation` bundle must have one owner file.
 * 2. Owned namespaces (`./namespaces.ts`) are registered for every locale and
 *    are no longer reachable through the flat bundle.
 * 3. Source: no call site still uses the flat `ns.key` form of an owned
 *    namespace, and every static key it uses exists in `en`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import i18next from 'i18next';
import { describe, expect, it } from 'vitest';
import { DEFAULT_NS, FEATURE_NAMESPACES, buildI18nResources } from './namespaces';
import en, { featureNamespaces as enNs } from './locales/en';
import ru, { featureNamespaces as ruNs } from './locales/ru';
import sr, { featureNamespaces as srNs } from './locales/sr';
import es, { featureNamespaces as esNs } from './locales/es';
import cs, { featureNamespaces as csNs } from './locales/cs';
import ar, { featureNamespaces as arNs } from './locales/ar';
import zh, { featureNamespaces as zhNs } from './locales/zh';
import id, { featureNamespaces as idNs } from './locales/id';
import hi, { featureNamespaces as hiNs } from './locales/hi';
import th, { featureNamespaces as thNs } from './locales/th';
import ja, { featureNamespaces as jaNs } from './locales/ja';

const LOCALE_MODULES = {
  en: { translation: en, featureNamespaces: enNs },
  ru: { translation: ru, featureNamespaces: ruNs },
  sr: { translation: sr, featureNamespaces: srNs },
  es: { translation: es, featureNamespaces: esNs },
  cs: { translation: cs, featureNamespaces: csNs },
  ar: { translation: ar, featureNamespaces: arNs },
  zh: { translation: zh, featureNamespaces: zhNs },
  id: { translation: id, featureNamespaces: idNs },
  hi: { translation: hi, featureNamespaces: hiNs },
  th: { translation: th, featureNamespaces: thNs },
  ja: { translation: ja, featureNamespaces: jaNs },
};

type Locale = keyof typeof LOCALE_MODULES;
const LOCALES = Object.keys(LOCALE_MODULES) as Locale[];

const SRC_DIR = join(process.cwd(), 'src');
const LOCALES_DIR = join(SRC_DIR, 'i18n/locales');

/** Top-level keys of the flat bundle, each mapped to the file(s) that define it. */
function flatOwners(locale: Locale): Map<string, string[]> {
  const index = readFileSync(join(LOCALES_DIR, locale, 'index.ts'), 'utf8');
  const fileByIdent = new Map<string, string>();
  for (const m of index.matchAll(/^import (\w+) from '\.\/(.+\.json)';$/gm)) {
    fileByIdent.set(m[1], m[2]);
  }
  const body = index.slice(index.indexOf('export default {'));
  const owners = new Map<string, string[]>();
  const add = (key: string, owner: string) => owners.set(key, [...(owners.get(key) ?? []), owner]);
  for (const m of body.matchAll(/^ {4}\.\.\.(\w+),$/gm)) {
    const file = fileByIdent.get(m[1]);
    expect(file, `${locale}/index.ts spreads unknown import ${m[1]}`).toBeDefined();
    const json = JSON.parse(readFileSync(join(LOCALES_DIR, locale, file!), 'utf8')) as object;
    for (const key of Object.keys(json)) add(key, file!);
  }
  for (const m of body.matchAll(/^ {4}(\w+)(?:,|:)/gm)) add(m[1], 'index.ts');
  return owners;
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (path !== LOCALES_DIR) sourceFiles(path, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

const i18n = i18next.createInstance();
void i18n.init({
  resources: buildI18nResources(LOCALE_MODULES),
  ns: [DEFAULT_NS, ...FEATURE_NAMESPACES],
  defaultNS: DEFAULT_NS,
  fallbackLng: false,
  initAsync: false,
  pluralSeparator: '_',
  contextSeparator: '_',
});

/** Static key, or the static prefix of a `${...}` template key, exists in `en`. */
function keyExists(ns: string, key: string): boolean {
  const dynamic = key.indexOf('${');
  if (dynamic >= 0) {
    const prefix = key.slice(0, dynamic).replace(/\.$/, '');
    const node = i18n.getResource('en', ns, prefix) as unknown;
    return typeof node === 'object' && node !== null;
  }
  return i18n.exists(key, { lng: 'en', ns, count: 1 });
}

describe('i18n namespace collisions', () => {
  for (const locale of LOCALES) {
    it(`${locale}: every top-level key of the flat bundle has exactly one owner`, () => {
      const collisions = [...flatOwners(locale)].filter(([, files]) => files.length > 1);
      expect(collisions, `${locale}: shared top-level keys are overwritten by the spread`).toEqual([]);
    });

    it(`${locale}: owned namespaces are registered and absent from the flat bundle`, () => {
      const flat = LOCALE_MODULES[locale].translation as Record<string, unknown>;
      for (const ns of FEATURE_NAMESPACES) {
        expect(Object.keys(flat), `${locale}: "${ns}" still spread into ${DEFAULT_NS}`).not.toContain(ns);
        const bundle = LOCALE_MODULES[locale].featureNamespaces[ns];
        expect(Object.keys(bundle).length, `${locale}:${ns} is empty`).toBeGreaterThan(0);
        expect(i18n.hasResourceBundle(locale, ns), `${locale}:${ns} not registered`).toBe(true);
      }
    });
  }

  it('owned namespace keys resolve in every locale without falling back', () => {
    for (const locale of LOCALES) {
      expect(i18n.t('playerCard:follow', { lng: locale })).not.toBe('follow');
      expect(i18n.t('playerCard:gamesCount', { lng: locale, count: 3 })).toContain('3');
      expect(i18n.exists('playerCard.follow', { lng: locale }), `${locale}: flat alias still resolves`).toBe(false);
    }
  });

  it('source uses owned namespaces only through the namespace, with keys that exist', () => {
    const problems: string[] = [];
    for (const file of sourceFiles(SRC_DIR)) {
      const text = readFileSync(file, 'utf8');
      const rel = relative(SRC_DIR, file);
      for (const ns of FEATURE_NAMESPACES) {
        for (const m of text.matchAll(new RegExp(`['"\`]${ns}\\.(?!json\\b)([\\w.]+)`, 'g'))) {
          problems.push(`${rel}: flat key "${ns}.${m[1]}" — use "${ns}:${m[1]}"`);
        }
        for (const m of text.matchAll(new RegExp(`['"\`]${ns}:([^'"\`]+)['"\`]`, 'g'))) {
          if (!keyExists(ns, m[1])) problems.push(`${rel}: missing key "${ns}:${m[1]}"`);
        }
        // A file whose only hook is `useTranslation('<ns>')` reads bare keys from that namespace.
        const hooks = [...text.matchAll(/useTranslation\(([^)]*)\)/g)].map((m) => m[1].trim());
        if (hooks.length > 0 && hooks.every((arg) => arg === `'${ns}'`)) {
          for (const m of text.matchAll(/\bt\(\s*['`]([^'`:]+)['`]/g)) {
            if (!keyExists(ns, m[1])) problems.push(`${rel}: missing key "${ns}:${m[1]}"`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
