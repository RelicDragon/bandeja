import { lazy, Suspense } from 'react';

const Inner = lazy(() => import('./ReactionEmojiCatalogInner'));

type Props = {
  onSelect: (emoji: string) => void;
  i18nLang: string;
  theme: 'light' | 'dark' | 'auto';
};

export function ReactionEmojiCatalog(props: Props) {
  return (
    <Suspense
      fallback={<div className="flex h-[min(55vh,420px)] items-center justify-center text-sm text-gray-500 dark:text-gray-400">…</div>}
    >
      <Inner {...props} />
    </Suspense>
  );
}
