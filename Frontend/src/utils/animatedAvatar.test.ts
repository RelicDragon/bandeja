import { afterEach, describe, expect, it, vi } from 'vitest';
import { animatedAvatarSrc, animatedAvatarTinyUrl, isAnimatedImageFile } from './animatedAvatar';

const ANIM = 'https://cdn.example.net/uploads/avatars/animated/ab_avatar.anim.webp';
const member = { avatar: 'https://cdn.example.net/uploads/avatars/circular/ab_avatar.jpg', avatarAnimated: ANIM, isPremium: true, showPremiumStatus: true };

describe('animated avatar helpers', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('derives the tiny animated variant like the still tiny URL', () => {
    expect(animatedAvatarTinyUrl(`${ANIM}?v=1`)).toBe('https://cdn.example.net/uploads/avatars/animated/ab_avatar.anim.tiny.webp?v=1');
    expect(animatedAvatarTinyUrl(member.avatar)).toBeNull();
    expect(animatedAvatarTinyUrl(null)).toBeNull();
  });

  it('animates members showing Premium at every size; hidden status or reduced motion keeps the still', () => {
    expect(animatedAvatarSrc(member)).toBe(ANIM);
    expect(animatedAvatarSrc(member, { tiny: true })).toContain('_avatar.anim.tiny.webp');
    expect(animatedAvatarSrc({ ...member, showPremiumStatus: false })).toBeNull();
    expect(animatedAvatarSrc({ ...member, showPremiumStatus: false }, { own: true })).toBe(ANIM);
    expect(animatedAvatarSrc({ ...member, isPremium: false })).toBeNull();
    expect(animatedAvatarSrc({ ...member, avatar: null })).toBeNull();
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) });
    expect(animatedAvatarSrc(member)).toBeNull();
  });

  it('sniffs animated GIF and WebP cheaply', async () => {
    const gce = [0x21, 0xf9, 0x04, 0, 0, 0, 0, 0];
    const gif = (frames: number) =>
      new Blob([new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, ...Array(frames).fill(gce).flat()])], { type: 'image/gif' });
    expect(await isAnimatedImageFile(gif(3))).toBe(true);
    expect(await isAnimatedImageFile(gif(1))).toBe(false);
    const riff = (chunk: string, flags: number) =>
      new Blob([new Uint8Array([...'RIFF'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBP'].map((c) => c.charCodeAt(0)), [...chunk].map((c) => c.charCodeAt(0)), [10, 0, 0, 0, flags, 0, 0, 0]))], { type: 'image/webp' });
    expect(await isAnimatedImageFile(riff('VP8X', 0x02))).toBe(true);
    expect(await isAnimatedImageFile(riff('VP8X', 0x10))).toBe(false);
    expect(await isAnimatedImageFile(riff('VP8 ', 0))).toBe(false);
    expect(await isAnimatedImageFile(new Blob([new Uint8Array(4)], { type: 'image/png' }))).toBe(false);
  });
});
