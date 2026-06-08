import { buildPerGroupBracketCreateGroup } from '@/utils/playoffWizardCreatePayload.util';
import type { BuildCreatePayloadInput, CreateBracketPayload } from './types';

export function buildCreatePayload(input: BuildCreatePayloadInput): CreateBracketPayload {
  return buildPerGroupBracketCreateGroup(input);
}
