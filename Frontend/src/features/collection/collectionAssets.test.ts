import { describe, expect, it } from 'vitest';
import {
  chatAccentClass,
  COLLECTION_ACCENT_KEYS,
  COLLECTION_FRAME_KEYS,
  COLLECTION_NAME_COLOR_KEYS,
  frameClass,
  kindLabelKey,
  nameColorClass,
  previewClassForKind,
  resolveNameClass,
  SHOP_KIND_ORDER,
} from './collectionAssets';

describe('asset keys resolve to shipped CSS', () => {
  it('maps every shipped frame key', () => {
    for (const key of COLLECTION_FRAME_KEYS) {
      expect(frameClass(key)).toBe(`collection-frame collection-${key}`);
    }
  });

  it('maps every shipped name colour and accent key', () => {
    for (const key of COLLECTION_NAME_COLOR_KEYS) {
      expect(nameColorClass(key)).toBe(`collection-name collection-${key}`);
    }
    for (const key of COLLECTION_ACCENT_KEYS) {
      expect(chatAccentClass(key)).toBe(`collection-accent collection-${key}`);
    }
  });

  it('renders nothing for an unknown key so a staged item cannot break a page', () => {
    expect(frameClass('frame-not-shipped-yet')).toBeNull();
    expect(nameColorClass('name-unknown')).toBeNull();
    expect(chatAccentClass('accent-unknown')).toBeNull();
    expect(frameClass(null)).toBeNull();
    expect(frameClass(undefined)).toBeNull();
    expect(frameClass('')).toBeNull();
  });

  it('never crosses kinds', () => {
    expect(frameClass('name-coral')).toBeNull();
    expect(nameColorClass('frame-neon')).toBeNull();
    expect(chatAccentClass('frame-neon')).toBeNull();
  });

  it('picks the right renderer per kind', () => {
    expect(previewClassForKind('PROFILE_FRAME', 'frame-neon')).toContain('collection-frame');
    expect(previewClassForKind('NAME_COLOR', 'name-coral')).toContain('collection-name');
    expect(previewClassForKind('CHAT_ACCENT', 'accent-neon')).toContain('collection-accent');
    // Sticker packs are art, not CSS.
    expect(previewClassForKind('STICKER_PACK', 'pack-summer')).toBeNull();
  });
});

describe('premium precedence', () => {
  it('lets a bought name colour paint the name when premium is not shown', () => {
    expect(resolveNameClass({ premiumVisible: false, nameColorAssetKey: 'name-violet' })).toBe(
      'collection-name collection-name-violet',
    );
  });

  it('gives way to premium gold whenever premium status is shown', () => {
    expect(resolveNameClass({ premiumVisible: true, nameColorAssetKey: 'name-violet' })).toBeNull();
  });

  it('is null when nothing is equipped', () => {
    expect(resolveNameClass({ premiumVisible: false, nameColorAssetKey: null })).toBeNull();
  });
});

describe('category chips', () => {
  it('renders frames, chat, stickers, name colours in that order', () => {
    expect(SHOP_KIND_ORDER).toEqual([
      'PROFILE_FRAME',
      'CHAT_ACCENT',
      'STICKER_PACK',
      'NAME_COLOR',
    ]);
  });

  it('gives every kind its own label key', () => {
    const keys = SHOP_KIND_ORDER.map(kindLabelKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key.startsWith('shop.category')).toBe(true);
  });
});
