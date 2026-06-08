import { buildBracketEditTreeColumns } from '@/utils/bracketEditTreeLayout.util';
import type { BracketEditPosition } from '@/utils/bracketSlotEdit.util';
import type { EditTreeLayout } from './types';

export function resolveEditTreeLayout(positions: BracketEditPosition[]): EditTreeLayout {
  return buildBracketEditTreeColumns(positions);
}
