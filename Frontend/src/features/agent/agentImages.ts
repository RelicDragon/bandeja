import { createContext, useContext } from 'react';
import { AGENT_IMAGE_REF_PREFIX, type AgentWebImage } from '@shared/agentContract';
import { resolveAbsoluteApiBaseUrlForFetch } from '@/api/apiBaseUrl';
import type { FullscreenMediaItem } from '@/components/fullscreenImageViewer/chatMediaGallery';
import type { AgentRenderItem } from './agentTimeline';

/**
 * Pictures the assistant may show (`web_images`). Only images a tool step of THIS chat
 * returned can render: the markdown `![caption](img:<id>)` is looked up here, and anything
 * else (a model-written URL, an unknown id) renders nothing. `src` / `full` / `thumb` are
 * signed image-proxy paths, so the app never loads a third-party URL directly.
 */

const IMAGE_REF = /!\[[^\]]*\]\(\s*img:([0-9a-f]{6,32})\s*\)/gi;

/** `img:<id>` → id, else null. */
export function agentImageRefId(src: string | null | undefined): string | null {
  if (!src || !src.toLowerCase().startsWith(AGENT_IMAGE_REF_PREFIX)) return null;
  const id = src.slice(AGENT_IMAGE_REF_PREFIX.length).trim().toLowerCase();
  return /^[0-9a-f]{6,32}$/.test(id) ? id : null;
}

/** Image-proxy path → absolute URL (web: same origin `/api`, native: the API host). */
export function agentImageUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${resolveAbsoluteApiBaseUrlForFetch().replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
}

export interface AgentChatImages {
  byId: ReadonlyMap<string, AgentWebImage>;
  /** Images shown inline in replies, in conversation order: the fullscreen gallery. */
  gallery: readonly AgentWebImage[];
}

/** Every image the chat's tool steps returned, plus the order replies show them in. */
export function collectAgentChatImages(timeline: readonly AgentRenderItem[]): AgentChatImages {
  const byId = new Map<string, AgentWebImage>();
  for (const item of timeline) {
    if (item.kind !== 'toolGroup') continue;
    for (const tool of item.tools) {
      for (const image of tool.images ?? []) {
        if (!byId.has(image.id)) byId.set(image.id, image);
      }
    }
  }
  const gallery: AgentWebImage[] = [];
  const seen = new Set<string>();
  for (const item of timeline) {
    if (item.kind !== 'assistantText') continue;
    for (const match of item.text.matchAll(IMAGE_REF)) {
      const id = match[1].toLowerCase();
      const image = byId.get(id);
      if (!image || seen.has(id)) continue;
      seen.add(id);
      gallery.push(image);
    }
  }
  return { byId, gallery };
}

export function agentImageMediaItem(image: AgentWebImage, index: number): FullscreenMediaItem {
  return {
    id: `agent-image:${image.id}`,
    messageId: `agent-image:${image.id}`,
    mediaIndex: index,
    kind: 'image',
    originalUrl: agentImageUrl(image.full),
    previewUrl: agentImageUrl(image.src),
  };
}

export interface AgentImagesContextValue {
  byId: ReadonlyMap<string, AgentWebImage>;
  /**
   * Open the fullscreen viewer on `id`. `scope` is the list to swipe through (a step's
   * thumbnails); default: every picture shown in the chat's replies.
   */
  open: (id: string, scope?: readonly AgentWebImage[]) => void;
}

const EMPTY: AgentImagesContextValue = { byId: new Map(), open: () => undefined };

export const AgentImagesContext = createContext<AgentImagesContextValue>(EMPTY);

export function useAgentImages(): AgentImagesContextValue {
  return useContext(AgentImagesContext);
}
