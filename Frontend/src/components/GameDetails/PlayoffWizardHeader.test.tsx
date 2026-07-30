import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DialogRoot } from '@/components/ui/Dialog';
import { PlayoffWizardHeader } from './PlayoffWizardHeader';

describe('PlayoffWizardHeader', () => {
  it('centers the title and renders modern step progress', () => {
    const html = renderToStaticMarkup(
      <DialogRoot open>
        <PlayoffWizardHeader
          current={3}
          total={4}
          title="Game Setup"
          stepLabel="Step 3 of 4"
        />
      </DialogRoot>
    );

    expect(html).toContain('>3/4<');
    expect(html).toContain('Game Setup');
    expect(html).toContain('!pr-0 text-center');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="3"');
    expect(html).toContain('width:75%');
  });
});
