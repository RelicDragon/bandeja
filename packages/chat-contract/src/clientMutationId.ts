export function normalizeClientMutationId(cid: string | null | undefined): string {
  return cid?.trim() ?? '';
}
