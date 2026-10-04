/**
 * i18n namespace registry. Rules: `docs/product/constraints.md` → "i18n namespaces".
 *
 * Everything not listed here still lives in the flat default namespace
 * (`translation`), merged by spread in `locales/<lng>/index.ts`, so existing
 * `useTranslation()` + `t('feature.key')` calls keep working unchanged.
 *
 * A namespace listed here is **owned**: it is registered as its own i18next
 * namespace and is no longer spread into `translation`. Its keys are read as
 * `useTranslation('<ns>')` + `t('key')` inside the feature, or `t('<ns>:key')`
 * from any other `t`. `namespaceCollisions.test.ts` enforces both directions.
 *
 * Append here (one namespace per change) when migrating the next feature.
 */
export const DEFAULT_NS = 'translation';

export const FEATURE_NAMESPACES = ['playerCard'] as const;

export type FeatureNamespace = (typeof FEATURE_NAMESPACES)[number];

/** Each locale index exports the unwrapped body of every owned namespace file. */
export type FeatureNamespaceBundles = Record<FeatureNamespace, Record<string, unknown>>;

type LocaleModule = {
  translation: Record<string, unknown>;
  featureNamespaces: FeatureNamespaceBundles;
};

export function buildI18nResources<L extends string>(locales: Record<L, LocaleModule>) {
  const resources = {} as Record<L, Record<string, Record<string, unknown>>>;
  for (const lng of Object.keys(locales) as L[]) {
    const { translation, featureNamespaces } = locales[lng];
    resources[lng] = { [DEFAULT_NS]: translation, ...featureNamespaces };
  }
  return resources;
}
