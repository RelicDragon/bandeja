import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
    i18n: { dir: () => 'ltr' },
  }),
}));

import { OnboardingFrame } from './OnboardingFrame';

const base = {
  step: 'city' as const,
  position: 3,
  total: 6,
  direction: 1 as const,
  onAdvance: () => {},
  title: 'Is this your city?',
  onPrimary: () => {},
  primaryLabel: 'Yes',
  children: <p>body</p>,
};

const render = (props: Partial<Parameters<typeof OnboardingFrame>[0]> = {}) =>
  renderToStaticMarkup(<OnboardingFrame {...base} {...props} />);

describe('OnboardingFrame', () => {
  it('announces the step as "Step 3 of 6"', () => {
    const html = render();
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="3"');
    expect(html).toContain('aria-valuemax="6"');
    expect(html).toContain('onboarding.frame.progress:{&quot;current&quot;:3,&quot;total&quot;:6}');
  });

  it('makes the step a landmark labelled by its h1', () => {
    const html = render();
    expect(html).toContain('<section');
    expect(html).toContain('<h1');
    expect(html).toContain('aria-labelledby=');
    expect(html).toContain('Is this your city?');
  });

  it('shows Skip only where the flow allows it', () => {
    expect(render({ onSkip: () => {} })).toContain('onboarding.frame.skip');
    expect(render({ onSkip: undefined })).not.toContain('onboarding.frame.skip');
  });

  it('shows Back only when there is a step behind', () => {
    expect(render({ onBack: () => {} })).toContain('onboarding.frame.back');
    expect(render({ onBack: undefined })).not.toContain('onboarding.frame.back');
  });

  it('disables the primary when the step says so', () => {
    expect(render({ primaryDisabled: true })).toContain('disabled=""');
    expect(render({ primaryDisabled: false })).not.toContain('disabled=""');
  });

  it('pins the primary above the keyboard inset rather than a hard-coded value', () => {
    // CONTRACT §7.3 — never a literal inset.
    expect(render()).toContain('--overlay-bottom-inset');
  });

  it('omits the footer entirely when the step supplies its own controls', () => {
    const html = render({ onPrimary: undefined, primaryLabel: undefined });
    expect(html).not.toContain('data-testid="onboarding-primary"');
    expect(html).toContain('hidden=""');
  });
});
