import { describe, expect, it } from 'vitest';
import { partitionMessageListNewKeys } from './partitionMessageListNewKeys';
import { TAIL_ENTER_MARK_SEEN_MS } from './useMessageListNewKeys';

describe('partitionMessageListNewKeys', () => {
  it('defers a single outgoing append in an empty thread', () => {
    const seen = new Set<string>();
    const result = partitionMessageListNewKeys(['cid:out-1'], [], seen);
    expect(result.deferred).toEqual(['cid:out-1']);
    expect(result.immediate).toEqual([]);
  });

  it('defers a single tail append in a populated thread', () => {
    const seen = new Set(['a', 'b']);
    const result = partitionMessageListNewKeys(['a', 'b', 'cid:out-2'], ['a', 'b'], seen);
    expect(result.deferred).toEqual(['cid:out-2']);
    expect(result.immediate).toEqual([]);
  });

  it('marks bulk initial load immediately', () => {
    const seen = new Set<string>();
    const keys = ['m1', 'm2', 'm3'];
    const result = partitionMessageListNewKeys(keys, [], seen);
    expect(result.deferred).toEqual([]);
    expect(result.immediate).toEqual(keys);
  });

  it('marks prepended history immediately', () => {
    const seen = new Set(['b', 'c']);
    const result = partitionMessageListNewKeys(['a', 'b', 'c'], ['b', 'c'], seen);
    expect(seen.has('a')).toBe(true);
    expect(result.deferred).toEqual([]);
    expect(result.immediate).toEqual([]);
  });

  it('defers burst tail appends', () => {
    const seen = new Set(['a']);
    const result = partitionMessageListNewKeys(['a', 'b', 'c'], ['a'], seen);
    expect(result.deferred).toEqual(['b', 'c']);
    expect(result.immediate).toEqual([]);
  });
});

describe('TAIL_ENTER_MARK_SEEN_MS', () => {
  it('allows full staggered enter to finish', () => {
    expect(TAIL_ENTER_MARK_SEEN_MS).toBeGreaterThanOrEqual(1200);
  });
});
