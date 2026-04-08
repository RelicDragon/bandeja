import { uniqueNamesGenerator, adjectives, animals } from 'unique-names-generator';

export const sanitizeDisplayNamePart = (value?: string | null): string =>
  (value || '').trim().slice(0, 100);

export type ResolvedDisplayName = {
  firstName: string | undefined;
  lastName: string | undefined;
  nameIsSet: boolean;
};

export function generateRandomAdjectiveAnimalLabel(): string {
  return uniqueNamesGenerator({
    dictionaries: [adjectives, animals],
    separator: ' ',
    style: 'capital',
    length: 2,
  });
}

export function resolveDisplayNameData(
  firstName?: string | null,
  lastName?: string | null
): ResolvedDisplayName {
  const sanitizedFirstName = sanitizeDisplayNamePart(firstName);
  const sanitizedLastName = sanitizeDisplayNamePart(lastName);
  const hasProvidedName = sanitizedFirstName.length >= 1 || sanitizedLastName.length >= 1;

  if (hasProvidedName) {
    return {
      firstName: sanitizedFirstName || undefined,
      lastName: sanitizedLastName || undefined,
      nameIsSet: true,
    };
  }

  return {
    firstName: generateRandomAdjectiveAnimalLabel(),
    lastName: undefined,
    nameIsSet: false,
  };
}

export function mergeOAuthLoginNames(
  userFirst: string | null | undefined,
  userLast: string | null | undefined,
  bodyFirst?: string,
  bodyLast?: string,
  userNameIsSet?: boolean | null
): ResolvedDisplayName {
  let effFirst = userFirst?.trim() ? sanitizeDisplayNamePart(userFirst) : '';
  let effLast = userLast?.trim() ? sanitizeDisplayNamePart(userLast) : '';
  if (userNameIsSet === false) {
    if (bodyFirst?.trim()) effFirst = sanitizeDisplayNamePart(bodyFirst);
    if (bodyLast?.trim()) effLast = sanitizeDisplayNamePart(bodyLast);
  } else {
    if (bodyFirst?.trim() && !effFirst) effFirst = sanitizeDisplayNamePart(bodyFirst);
    if (bodyLast?.trim() && !effLast) effLast = sanitizeDisplayNamePart(bodyLast);
  }
  return resolveDisplayNameData(effFirst || undefined, effLast || undefined);
}

export function needsDisplayNamePersist(
  row: { firstName?: string | null; lastName?: string | null; nameIsSet?: boolean | null },
  resolved: ResolvedDisplayName
): boolean {
  const curF = (row.firstName || '').trim();
  const curL = (row.lastName || '').trim();
  const resF = (resolved.firstName || '').trim();
  const resL = (resolved.lastName || '').trim();
  if (resF !== curF || resL !== curL) return true;
  return Boolean(resolved.nameIsSet) !== Boolean(row.nameIsSet);
}
