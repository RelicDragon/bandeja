import { useSyncExternalStore } from 'react';

let engagementPaused = false;
const listeners = new Set<() => void>();

export function setStoryViewerEngagementPaused(value: boolean) {
  if (engagementPaused === value) return;
  engagementPaused = value;
  listeners.forEach((l) => l());
}

export function resetStoryViewerEngagementPaused() {
  setStoryViewerEngagementPaused(false);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStoryViewerEngagementPaused() {
  return engagementPaused;
}

export function useStoryViewerEngagementPaused() {
  return useSyncExternalStore(subscribe, getStoryViewerEngagementPaused);
}

let openCommentsHandler: (() => void) | null = null;

export const storyViewerEngagementActions = {
  setOpenCommentsHandler(handler: (() => void) | null) {
    openCommentsHandler = handler;
  },
  openComments() {
    openCommentsHandler?.();
  },
};
