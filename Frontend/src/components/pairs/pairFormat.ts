import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PairMember } from '@/api/pairs';

/**
 * PRD 352 — locale-correct numbers for the pairs surfaces.
 *
 * Percentages and counts go through `Intl` for the active locale (Arabic digits
 * in `ar`, the right group separator in `cs`/`ru`), never through `toFixed` and
 * a hard-coded `%`.
 */

/** A pair beats the solo average by this many points before the chip turns green. */
export const CHEMISTRY_POSITIVE_THRESHOLD = 5;

export function memberDisplayName(member: PairMember): string {
  const first = member.firstName?.trim() ?? '';
  const last = member.lastName?.trim() ?? '';
  return first || last || '—';
}

/**
 * "Marko & Ana".
 *
 * Composed in code rather than through a translation key on purpose: the
 * template would be nothing but two placeholders and an ampersand, which is
 * punctuation in every one of the 11 locales and would be a byte-identical
 * "untranslated" string in all of them. The *spoken* form used by screen
 * readers does carry a real word and lives in `pairs.names.spoken`.
 */
export function pairDisplayName(first: string, second: string): string {
  return `${first} & ${second}`;
}

/** "18 games · 72 %" — both halves are already localized by the caller. */
export function pairSummaryLine(gamesLabel: string, winRateLabel: string): string {
  return `${gamesLabel} · ${winRateLabel}`;
}

export interface PairFormatters {
  /** `72` → `72 %` in the active locale. */
  percent: (value: number) => string;
  /** Bare percentage number, for screen-reader strings that say "percent". */
  percentNumber: (value: number) => string;
  count: (value: number) => string;
  /** `9` → `+9`, `-4` → `-4`, in the active locale. */
  signed: (value: number) => string;
}

export function usePairFormatters(): PairFormatters {
  const { i18n } = useTranslation();

  return useMemo(() => {
    const locale = i18n.language || 'en';
    const percentFormat = new Intl.NumberFormat(locale, {
      style: 'percent',
      maximumFractionDigits: 0,
    });
    const numberFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
    const signedFormat = new Intl.NumberFormat(locale, {
      maximumFractionDigits: 0,
      signDisplay: 'exceptZero',
    });

    return {
      percent: (value: number) => percentFormat.format(value / 100),
      percentNumber: (value: number) => numberFormat.format(Math.round(value)),
      count: (value: number) => numberFormat.format(value),
      signed: (value: number) => signedFormat.format(value),
    };
  }, [i18n.language]);
}

export function isPositiveChemistry(chemistry: number | null | undefined): boolean {
  return typeof chemistry === 'number' && chemistry >= CHEMISTRY_POSITIVE_THRESHOLD;
}
