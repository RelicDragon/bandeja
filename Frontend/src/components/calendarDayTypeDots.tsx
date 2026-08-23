import type { FindDisplayEntityType } from '@/utils/findFilter';
import {
  ENTITY_TYPE_CHIP_DOT_CLASS,
  ENTITY_TYPE_DOT_CLASS,
  ENTITY_TYPE_DOT_INVERTED_CLASS,
} from '@/utils/entityTypeDotClass';

export function EntityTypeDot({
  type,
  inverted = false,
  surface = 'calendar',
  className = 'h-1.5 w-1.5',
}: {
  type: FindDisplayEntityType;
  inverted?: boolean;
  surface?: 'calendar' | 'chip';
  className?: string;
}) {
  const palette = inverted
    ? ENTITY_TYPE_DOT_INVERTED_CLASS
    : surface === 'chip'
      ? ENTITY_TYPE_CHIP_DOT_CLASS
      : ENTITY_TYPE_DOT_CLASS;
  return (
    <span
      aria-hidden
      className={`relative shrink-0 overflow-hidden rounded-full shadow-[inset_0_0.5px_0.5px_rgba(255,255,255,0.28),inset_0_-0.5px_0.5px_rgba(0,0,0,0.12)] ${className} ${palette[type]}`}
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
