import { describe, expect, it } from 'vitest';
import { isGifProviderHostedUrl } from './gifProviderUrl';

describe('isGifProviderHostedUrl', () => {
  it('recognizes provider hosts and subdomains', () => {
    expect(isGifProviderHostedUrl('https://media3.giphy.com/a.gif')).toBe(true);
    expect(isGifProviderHostedUrl('https://static1.klipy.com/a.gif')).toBe(true);
    expect(isGifProviderHostedUrl('https://media.tenor.com/a.gif')).toBe(true);
    expect(isGifProviderHostedUrl('https://media1.tenor.com/m/x/a.gif')).toBe(true);
    expect(isGifProviderHostedUrl('https://tenor.com/view/x-gif-1')).toBe(true);
  });

  it('does not trust provider names in paths or lookalike hosts', () => {
    expect(isGifProviderHostedUrl('https://cdn.example.com/giphy.com/a.gif')).toBe(false);
    expect(isGifProviderHostedUrl('https://giphy.com.evil.example/a.gif')).toBe(false);
    expect(isGifProviderHostedUrl('https://tenor.com.evil.example/a.gif')).toBe(false);
    expect(isGifProviderHostedUrl('not-a-url')).toBe(false);
  });
});
