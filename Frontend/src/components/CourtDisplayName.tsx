import { resolveCourtNameParts } from '@/utils/courtDisplayName';

type CourtDisplayNameProps = {
  name: string;
  integrationName?: string | null;
  primaryClassName?: string;
  secondaryClassName?: string;
  className?: string;
};

export function CourtDisplayName({
  name,
  integrationName,
  primaryClassName = 'font-medium',
  secondaryClassName = 'text-xs text-gray-500 dark:text-gray-400',
  className = '',
}: CourtDisplayNameProps) {
  const parts = resolveCourtNameParts(name, integrationName);

  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-1.5 ${className}`.trim()}>
      <span className={primaryClassName}>{parts.name}</span>
      {parts.integrationName ? (
        <span className={secondaryClassName}>{parts.integrationName}</span>
      ) : null}
    </span>
  );
}
