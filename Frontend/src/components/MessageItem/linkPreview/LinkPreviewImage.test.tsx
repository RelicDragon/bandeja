import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LinkPreviewImage } from './LinkPreviewImage';

describe('LinkPreviewImage', () => {
  it('renders immediately available sources on the first paint', () => {
    const html = renderToStaticMarkup(
      <LinkPreviewImage
        src="/preview/thumb.webp"
        className="h-12 w-12"
        fallback={<span data-fallback="true" />}
      />
    );

    expect(html).toContain('src="/preview/thumb.webp"');
    expect(html).not.toContain('data-fallback="true"');
  });
});
