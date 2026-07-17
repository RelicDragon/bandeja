import { describe, expect, it } from 'vitest';
import type { LinkPreviewData } from '@/api/linkPreview';
import {
  resolveLinkPreviewDescription,
  resolveLinkPreviewTitle,
} from './resolveLinkPreviewCopy';

const instagramPreview = {
  title: '@creator on Instagram: "A long caption"',
  description: '22 likes, 0 comments - creator: "A long caption"',
  provider: 'instagram',
  hostname: 'instagram.com',
  siteName: 'Instagram',
} as LinkPreviewData;

describe('Instagram link preview copy', () => {
  it('keeps persisted provider cards compact', () => {
    const t = (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? '';
    const title = resolveLinkPreviewTitle(instagramPreview, t);

    expect(title).toBe('@creator on Instagram');
    expect(resolveLinkPreviewDescription(instagramPreview, t, title)).toBeNull();
  });
});
