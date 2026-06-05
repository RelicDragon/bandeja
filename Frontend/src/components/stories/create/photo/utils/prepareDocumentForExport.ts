import { DEFAULT_TRANSFORM, type StoryDocument } from '../types';
import { getMediaNode, patchMediaDimensions } from './document';
import { ensureDocumentMediaDimensions } from './ensureMediaDimensions';
import { defaultMediaTransform } from './transform';

/** Ensures media dimensions and cover transform before `drawScene` (matches editor preview). */
export async function prepareDocumentForExport(doc: StoryDocument): Promise<StoryDocument> {
  let resolved = await ensureDocumentMediaDimensions(doc);
  const media = getMediaNode(resolved);
  if (!media) return resolved;

  const nw = media.source.naturalWidth;
  const nh = media.source.naturalHeight;
  if (nw == null || nh == null || nw <= 0 || nh <= 0) return resolved;

  const t = media.transform;
  const isDefaultTransform =
    t.scale === DEFAULT_TRANSFORM.scale &&
    t.x === DEFAULT_TRANSFORM.x &&
    t.y === DEFAULT_TRANSFORM.y &&
    t.rotation === DEFAULT_TRANSFORM.rotation;

  if (isDefaultTransform) {
    resolved = patchMediaDimensions(resolved, nw, nh, defaultMediaTransform(nw, nh));
  }

  return resolved;
}
