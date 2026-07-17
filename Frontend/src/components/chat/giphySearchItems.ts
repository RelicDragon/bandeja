import type { GiphySearchItem } from '@/api/giphy';

export function mergeGiphySearchItems(
  current: GiphySearchItem[],
  incoming: GiphySearchItem[]
): GiphySearchItem[] {
  const merged = new Map<string, GiphySearchItem>();
  for (const item of [...current, ...incoming]) {
    merged.set(`${item.provider}:${item.id}`, item);
  }
  return [...merged.values()];
}

export function applyGiphySearchPageItems(
  current: GiphySearchItem[],
  incoming: GiphySearchItem[],
  append: boolean
): GiphySearchItem[] {
  if (!append) return incoming;
  return mergeGiphySearchItems(current, incoming);
}
