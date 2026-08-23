import type { FindDisplayEntityType } from '@/utils/findFilter';
import {
  ENTITY_TYPE_DOT_CLASS,
  ENTITY_TYPE_DOT_INVERTED_CLASS,
} from '@/utils/entityTypeDotClass';

export function EntityTypeDot({
  type,
  inverted = false,
  className = 'h-1.5 w-1.5',
}: {
  type: FindDisplayEntityType;
  inverted?: boolean;
  className?: string;
}) {
  const palette = inverted ? ENTITY_TYPE_DOT_INVERTED_CLASS : ENTITY_TYPE_DOT_CLASS;
  return (
    <span
      aria-hidden
      className={`shrink-0 rounded-full ${className} ${palette[type]}`}
    />
  );
}

export function CalendarDayTypeDots({
  types,
  inverted = false,
  className = '',
}: {
  types: FindDisplayEntityType[];
  inverted?: boolean;
  className?: string;
}) {
  if (types.length === 0) return null;
  return (
    <span className={`inline-flex items-center justify-center gap-px ${className}`.trim()}>
      {types.map((entityType) => (
        <EntityTypeDot key={entityType} type={entityType} inverted={inverted} />
      ))}
    </span>
  );
}
