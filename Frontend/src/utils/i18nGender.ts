import type { Gender } from '@/types';

/** i18next context for gendered 2nd-person copy (`key_female`). */
export function genderI18nContext(
  gender?: Gender | string | null,
): 'female' | undefined {
  return gender === 'FEMALE' ? 'female' : undefined;
}
