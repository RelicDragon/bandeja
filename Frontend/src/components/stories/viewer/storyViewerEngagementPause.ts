import { useSyncExternalStore } from 'react';

let engagementPaused = false;
let ownerMenuPaused = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function isPaused() {
  return engagementPaused || ownerMenuPaused;
}

export function setStoryViewerEngagementPaused(value: boolean) {
  if (engagementPaused === value) return;
  engagementPaused = value;
  notify();
}

export function setStoryViewerOwnerMenuPaused(value: boolean) {
  if (ownerMenuPaused === value) return;
  ownerMenuPaused = value;
  notify();
}

export function resetStoryViewerEngagementPaused() {
  engagementPaused = false;
  ownerMenuPaused = false;
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStoryViewerEngagementPaused() {
  return isPaused();
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
