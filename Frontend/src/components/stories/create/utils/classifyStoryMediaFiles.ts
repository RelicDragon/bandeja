import type { StoryMediaFile } from '../types/storyEditor.types';

export type ClassifiedStoryMedia =
  | { kind: 'image'; files: StoryMediaFile[] }
  | { kind: 'video'; file: StoryMediaFile }
  | { kind: 'mixed' }
  | { kind: 'multipleVideos' }
  | { kind: 'empty' };

export function classifyStoryMediaFiles(files: StoryMediaFile[]): ClassifiedStoryMedia {
  const images = files.filter((f) => f.mediaType === 'IMAGE');
  const videos = files.filter((f) => f.mediaType === 'VIDEO');

  if (images.length > 0 && videos.length > 0) return { kind: 'mixed' };
  if (videos.length > 1) return { kind: 'multipleVideos' };
  if (videos.length === 1) return { kind: 'video', file: videos[0]! };
  if (images.length > 0) return { kind: 'image', files };
  return { kind: 'empty' };
}
