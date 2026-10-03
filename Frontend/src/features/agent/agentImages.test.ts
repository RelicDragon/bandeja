import { describe, expect, it } from 'vitest';
import type { AgentWebImage } from '@shared/agentContract';
import { agentImageMediaItem, agentImageRefId, collectAgentChatImages } from './agentImages';
import type { AgentRenderItem } from './agentTimeline';

const image = (id: string): AgentWebImage => ({
  id,
  src: `/link-preview/image?u=${id}&fit=inside`,
  full: `/link-preview/image?u=${id}&w=1600`,
  thumb: `/link-preview/image?u=${id}&w=160`,
  alt: `alt ${id}`,
  pageUrl: null,
  host: 'example.org',
  width: null,
  height: null,
});

const group = (key: string, images: AgentWebImage[]): AgentRenderItem => ({
  kind: 'toolGroup',
  key,
  tools: [{ callId: key, label: 'l', status: 'ok', summary: null, entities: [], images }],
});

const text = (key: string, value: string): AgentRenderItem => ({ kind: 'assistantText', key, text: value, streaming: false });

describe('agentImageRefId', () => {
  it('accepts only img:<hex id>', () => {
    expect(agentImageRefId('img:abc123ef90')).toBe('abc123ef90');
    expect(agentImageRefId('IMG:ABC123EF90')).toBe('abc123ef90');
    expect(agentImageRefId('https://evil.example/x.png?leak=1')).toBeNull();
    expect(agentImageRefId('img:../../etc')).toBeNull();
    expect(agentImageRefId(undefined)).toBeNull();
  });
});

describe('collectAgentChatImages', () => {
  it('gallery = pictures replies show, in conversation order, known ids only, no repeats', () => {
    const timeline: AgentRenderItem[] = [
      group('c1', [image('aaaaaa1111'), image('bbbbbb2222'), image('cccccc3333')]),
      text('t1', 'Diamond:\n![d](img:bbbbbb2222)\n![x](img:ffffff9999)\n![a](img:aaaaaa1111)'),
      group('c2', [image('dddddd4444')]),
      text('t2', 'Again ![d](img:bbbbbb2222) and ![n](img:dddddd4444) and ![u](https://evil.example/p.png)'),
    ];
    const { byId, gallery } = collectAgentChatImages(timeline);
    expect([...byId.keys()]).toEqual(['aaaaaa1111', 'bbbbbb2222', 'cccccc3333', 'dddddd4444']);
    expect(gallery.map((i) => i.id)).toEqual(['bbbbbb2222', 'aaaaaa1111', 'dddddd4444']);
  });

  it('viewer items load the proxy (absolute), fullscreen size first', () => {
    const item = agentImageMediaItem(image('aaaaaa1111'), 0);
    expect(item.kind).toBe('image');
    expect(item.id).toBe('agent-image:aaaaaa1111');
    expect(item.originalUrl).toMatch(/^https?:\/\/.+\/link-preview\/image\?u=aaaaaa1111&w=1600$/);
    expect(item.previewUrl).toMatch(/fit=inside$/);
  });
});
