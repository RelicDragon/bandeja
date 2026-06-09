import { describe, expect, it } from 'vitest';
import { shouldFetchMarketForUnknownGroupUnread } from './marketUnknownGroupUnread';

describe('shouldFetchMarketForUnknownGroupUnread', () => {
  it('fetches once for unknown group on market tab', () => {
    const data = { contextType: 'GROUP', contextId: 'ch-1' };
    expect(shouldFetchMarketForUnknownGroupUnread('market', data, [], null)).toBe(true);
    expect(shouldFetchMarketForUnknownGroupUnread('market', data, [], 'ch-1')).toBe(false);
  });

  it('skips when channel already listed', () => {
    const data = { contextType: 'GROUP', contextId: 'ch-1' };
    expect(shouldFetchMarketForUnknownGroupUnread('market', data, ['ch-1'], null)).toBe(false);
  });

  it('skips off market tab', () => {
    const data = { contextType: 'GROUP', contextId: 'ch-1' };
    expect(shouldFetchMarketForUnknownGroupUnread('users', data, [], null)).toBe(false);
  });
});
