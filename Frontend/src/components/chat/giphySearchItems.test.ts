import { describe, expect, it } from 'vitest';
import type { GiphySearchItem } from '@/api/giphy';
import {
  applyGiphySearchPageItems,
  mergeGiphySearchItems,
} from './giphySearchItems';

const gif = (provider: 'GIPHY' | 'KLIPY', id: string): GiphySearchItem => ({
  provider,
  id,
  title: id,
  previewUrl: `https://media.giphy.com/${id}-preview.gif`,
  downloadUrl: `https://media.giphy.com/${id}.gif`,
  width: 200,
  height: 200,
});

describe('mergeGiphySearchItems', () => {
  it('deduplicates overlapping IDs within each provider', () => {
    expect(
      mergeGiphySearchItems(
        [gif('GIPHY', 'one'), gif('GIPHY', 'two')],
        [gif('GIPHY', 'two'), gif('KLIPY', 'two')]
      ).map(({ provider, id }) => `${provider}:${id}`)
    ).toEqual(['GIPHY:one', 'GIPHY:two', 'KLIPY:two']);
  });

  it('preserves visible results when failover changes provider', () => {
    expect(
      applyGiphySearchPageItems(
        [gif('GIPHY', 'one'), gif('GIPHY', 'two')],
        [gif('KLIPY', 'one')],
        true
      )
    ).toEqual([
      gif('GIPHY', 'one'),
      gif('GIPHY', 'two'),
      gif('KLIPY', 'one'),
    ]);
  });

  it('appends and deduplicates while the provider is stable', () => {
    expect(
      applyGiphySearchPageItems(
        [gif('KLIPY', 'one')],
        [gif('KLIPY', 'one'), gif('KLIPY', 'two')],
        true
      )
    ).toEqual([gif('KLIPY', 'one'), gif('KLIPY', 'two')]);
  });
});
