// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PreferenceLrChipPair } from './PreferenceLrChipPair';

function renderPair(left: boolean | undefined, right: boolean | undefined) {
  return renderToStaticMarkup(
    <PreferenceLrChipPair
      group="hand"
      groupLabel="Hand"
      left={left}
      right={right}
      leftLabel="L"
      rightLabel="R"
      leftTitle="Left"
      rightTitle="Right"
    />,
  );
}

function selectedAttr(html: string, side: 'left' | 'right'): string | null {
  const tag = html.match(
    new RegExp(`<(?:span|div)\\b[^>]*data-testid="preference-chip-hand-${side}"[^>]*>`),
  );
  return tag?.[0].match(/data-selected="(true|false)"/)?.[1] ?? null;
}

describe('PreferenceLrChipPair', () => {
  it('marks only left selected when only left is set', () => {
    const html = renderPair(true, false);
    expect(selectedAttr(html, 'left')).toBe('true');
    expect(selectedAttr(html, 'right')).toBe('false');
    expect(html).toContain('border-dashed');
    expect(html).toContain('bg-blue-600');
    expect(html).toContain('aria-label="Hand: Left"');
    expect(html).not.toContain('aria-pressed');
  });

  it('marks omitted flags as unset, not both selected', () => {
    const html = renderPair(undefined, undefined);
    expect(selectedAttr(html, 'left')).toBe('false');
    expect(selectedAttr(html, 'right')).toBe('false');
    expect(html).not.toContain('bg-blue-600');
    expect(html).toContain('border-dashed');
    expect(html).toContain('aria-label="Hand"');
  });

  it('marks explicit false flags as unset, not both-on fill', () => {
    const html = renderPair(false, false);
    expect(selectedAttr(html, 'left')).toBe('false');
    expect(selectedAttr(html, 'right')).toBe('false');
    expect(html).not.toContain('bg-blue-600');
    expect(html).toContain('border-dashed');
  });

  it('keeps both selected when both flags are true', () => {
    const html = renderPair(true, true);
    expect(selectedAttr(html, 'left')).toBe('true');
    expect(selectedAttr(html, 'right')).toBe('true');
    expect(html).not.toContain('border-dashed');
    expect(html).toContain('aria-label="Hand: Left, Right"');
  });

  it('marks only court-side left selected when only left is set', () => {
    const html = renderToStaticMarkup(
      <PreferenceLrChipPair
        group="courtSide"
        groupLabel="Court side"
        left={true}
        right={false}
        leftLabel="L"
        rightLabel="R"
        leftTitle="Left"
        rightTitle="Right"
      />,
    );
    expect(html).toContain('data-testid="preference-chip-courtSide-left"');
    expect(html).toMatch(/data-testid="preference-chip-courtSide-left"[^>]*data-selected="true"/);
    expect(html).toMatch(/data-testid="preference-chip-courtSide-right"[^>]*data-selected="false"/);
    expect(html).toContain('aria-label="Court side: Left"');
  });
});
