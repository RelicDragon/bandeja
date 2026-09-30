import { describe, expect, it } from 'vitest';
import { classifyAgentLink } from './agentLinks';

describe('classifyAgentLink', () => {
  it('routes in-app paths through the router', () => {
    expect(classifyAgentLink('/games/abc')).toEqual({ kind: 'internal', path: '/games/abc' });
    expect(classifyAgentLink('/?tab=ai')).toEqual({ kind: 'internal', path: '/?tab=ai' });
    expect(classifyAgentLink('https://bandeja.me/games/abc?x=1')).toEqual({
      kind: 'internal',
      path: '/games/abc?x=1',
    });
  });

  it('opens other http(s) links externally', () => {
    expect(classifyAgentLink('https://example.com/a')).toEqual({ kind: 'external', url: 'https://example.com/a' });
  });

  it('blocks non-http schemes, protocol-relative and unknown in-app paths', () => {
    expect(classifyAgentLink('javascript:alert(1)')).toEqual({ kind: 'blocked' });
    expect(classifyAgentLink('data:text/html,hi')).toEqual({ kind: 'blocked' });
    expect(classifyAgentLink('//evil.example/x')).toEqual({ kind: 'blocked' });
    expect(classifyAgentLink('/admin/secret')).toEqual({ kind: 'blocked' });
    expect(classifyAgentLink('')).toEqual({ kind: 'blocked' });
    expect(classifyAgentLink(undefined)).toEqual({ kind: 'blocked' });
  });
});
