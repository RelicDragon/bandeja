import { nanoid } from 'nanoid';
import {
  DEFAULT_MEDIA_ADJUST,
  DEFAULT_TRANSFORM,
  STORY_CANVAS_HEIGHT,
  STORY_CANVAS_WIDTH,
  type MediaNode,
  type StoryDocument,
  type StoryLayer,
  type StoryMediaFile,
  type StoryNode,
  type TextNode,
} from '../types';

export function createDocumentFromFile(file: StoryMediaFile): StoryDocument {
  const mediaId = nanoid();
  const previewUrl = URL.createObjectURL(file.file);
  const mediaNode: MediaNode = {
    id: mediaId,
    type: 'media',
    mediaType: 'IMAGE',
    source: { file: file.file, previewUrl },
    transform: { ...DEFAULT_TRANSFORM },
    adjust: { ...DEFAULT_MEDIA_ADJUST },
  };
  return {
    version: 3,
    canvas: { width: STORY_CANVAS_WIDTH, height: STORY_CANVAS_HEIGHT },
    nodes: [mediaNode],
    backgroundId: mediaId,
  };
}

export function getMediaNode(doc: StoryDocument): MediaNode | null {
  const node = doc.nodes.find((n) => n.id === doc.backgroundId && n.type === 'media');
  return node?.type === 'media' ? node : null;
}

export function getOverlayNodes(doc: StoryDocument): StoryLayer[] {
  return doc.nodes.filter((n): n is StoryLayer => n.type === 'text' || n.type === 'sticker');
}

export function patchDocumentMedia(doc: StoryDocument, file: File, previewUrl: string): StoryDocument {
  const media = getMediaNode(doc);
  if (!media) return doc;
  return {
    ...doc,
    nodes: doc.nodes.map((n) =>
      n.id === media.id
        ? {
            ...n,
            source: { file, previewUrl },
            transform: { ...DEFAULT_TRANSFORM },
            adjust: { ...DEFAULT_MEDIA_ADJUST },
          }
        : n
    ),
  };
}

export function patchMediaDimensions(
  doc: StoryDocument,
  naturalWidth: number,
  naturalHeight: number,
  transform = DEFAULT_TRANSFORM
): StoryDocument {
  const media = getMediaNode(doc);
  if (!media) return doc;
  return {
    ...doc,
    nodes: doc.nodes.map((n) =>
      n.id === media.id
        ? {
            ...media,
            source: { ...media.source, naturalWidth, naturalHeight },
            transform,
          }
        : n
    ),
  };
}

export function revokeDocumentUrls(doc: StoryDocument): void {
  const media = getMediaNode(doc);
  if (media) URL.revokeObjectURL(media.source.previewUrl);
}

export function updateNodeInDocument<T extends StoryNode>(
  doc: StoryDocument,
  nodeId: string,
  updater: (node: T) => T
): StoryDocument {
  return {
    ...doc,
    nodes: doc.nodes.map((n) => (n.id === nodeId ? updater(n as T) : n)),
  };
}

export function removeNodeFromDocument(doc: StoryDocument, nodeId: string): StoryDocument {
  return { ...doc, nodes: doc.nodes.filter((n) => n.id !== nodeId) };
}

export function appendOverlayNode(doc: StoryDocument, node: TextNode | StoryLayer): StoryDocument {
  return { ...doc, nodes: [...doc.nodes, node] };
}
