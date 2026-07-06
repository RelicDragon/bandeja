import { describe, expect, it } from 'vitest';
import type { GamePhoto } from '@/api/gamePhotos';

function photo(id: string, createdAt: string): GamePhoto {
  return {
    id,
    gameId: 'g1',
    originalUrl: `/o-${id}.jpg`,
    thumbnailUrl: `/t-${id}.jpg`,
    createdAt,
  };
}

function mergeGamePhotoLists(server: GamePhoto[], local: GamePhoto[]): GamePhoto[] {
  const byId = new Map<string, GamePhoto>();
  for (const item of server) {
    byId.set(item.id, item);
  }
  for (const item of local) {
    if (!byId.has(item.id)) {
      byId.set(item.id, item);
    }
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

describe('mergeGamePhotoLists', () => {
  it('keeps optimistic local photos missing from an in-flight server list', () => {
    const local = [photo('new-upload', '2026-07-06T20:00:00.000Z')];
    const server = [photo('existing', '2026-07-06T19:00:00.000Z')];
    const merged = mergeGamePhotoLists(server, local);
    expect(merged.map((p) => p.id)).toEqual(['new-upload', 'existing']);
  });

  it('prefers server copy when both lists contain the same id', () => {
    const local = [photo('shared', '2026-07-06T20:00:00.000Z')];
    const server = [
      {
        ...photo('shared', '2026-07-06T20:00:00.000Z'),
        thumbnailUrl: '/server-thumb.jpg',
      },
    ];
    const merged = mergeGamePhotoLists(server, local);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.thumbnailUrl).toBe('/server-thumb.jpg');
  });
});
