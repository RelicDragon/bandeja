/** First image URL from a Replicate prediction output (string, URL array, or FileOutput objects). */
export function extractReplicateImageUrl(output: unknown): string | null {
  if (!output) return null;
  if (typeof output === 'string') return output;
  if (!Array.isArray(output) || output.length === 0) return null;

  const first = output[0];
  if (typeof first === 'string') return first;
  if (first && typeof first === 'object' && 'url' in first) {
    const url = (first as { url?: () => string }).url;
    if (typeof url === 'function') return url();
  }
  return null;
}
