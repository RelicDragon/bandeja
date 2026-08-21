import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(join(__dirname, 'AnimatedLoadingSwap.tsx'), 'utf8');

describe('AnimatedLoadingSwap', () => {
  it('does not use AnimatePresence mode=wait', () => {
    expect(src).not.toMatch(/mode=["']wait["']/);
    expect(src).not.toMatch(/mode:\s*["']wait["']/);
  });
});
