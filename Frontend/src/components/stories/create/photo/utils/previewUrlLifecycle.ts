import type { StoryDocument } from '../types';
import { getMediaNode } from './document';

export function collectPreviewUrls(segments: StoryDocument[]): string[] {
  const urls: string[] = [];
  for (const doc of segments) {
    const media = getMediaNode(doc);
    if (media?.source.previewUrl) urls.push(media.source.previewUrl);
  }
  return urls;
}

/** Revoke blob URLs that are not in `live`. */
export function revokeUrlsNotIn(candidates: Iterable<string>, live: Set<string>): void {
  const seen = new Set<string>();
  for (const url of candidates) {
    if (seen.has(url) || live.has(url)) continue;
    seen.add(url);
    URL.revokeObjectURL(url);
  }
}

export function collectLivePreviewUrls(
  current: StoryDocument[],
  stacks: Array<{ segments: StoryDocument[] }>
): Set<string> {
  const live = new Set(collectPreviewUrls(current));
  for (const snap of stacks) {
    for (const url of collectPreviewUrls(snap.segments)) live.add(url);
  }
  return live;
}
