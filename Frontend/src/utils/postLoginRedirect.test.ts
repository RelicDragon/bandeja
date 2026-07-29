import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPostLoginPath,
  consumePostLoginPath,
  readPostLoginPath,
  rememberPostLoginPath,
} from './postLoginRedirect';

describe('post-login redirect', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    } satisfies Storage);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('preserves an internal deep link once', () => {
    rememberPostLoginPath('/?joinPlayIntent=intent-1');

    expect(readPostLoginPath()).toBe('/?joinPlayIntent=intent-1');
    expect(readPostLoginPath()).toBe('/?joinPlayIntent=intent-1');
    expect(consumePostLoginPath()).toBe('/?joinPlayIntent=intent-1');
    expect(consumePostLoginPath()).toBe('/');
  });

  it('can clear a remembered path without consuming it', () => {
    rememberPostLoginPath('/?joinPlayIntent=intent-1');
    clearPostLoginPath();
    expect(readPostLoginPath()).toBe('/');
  });

  it('rejects external redirects', () => {
    rememberPostLoginPath('//evil.example/path');

    expect(consumePostLoginPath()).toBe('/');
  });
});
