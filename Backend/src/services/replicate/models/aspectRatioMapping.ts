export type GptImage2AspectRatio = '1:1' | '3:2' | '2:3';

const GPT_IMAGE_2_ASPECT_RATIOS: GptImage2AspectRatio[] = ['1:1', '3:2', '2:3'];

function parseAspectRatioValue(ratio: string): number | null {
  const match = ratio.trim().match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || height <= 0) {
    return null;
  }
  return width / height;
}

/**
 * Maps an internal aspect ratio (e.g. FLUX `4:5`) to the closest gpt-image-2 option.
 * Uses log-space distance so portrait/landscape swaps are penalized correctly.
 */
export function mapAspectRatioToGptImage2(
  internalRatio: string | undefined,
  fallback: GptImage2AspectRatio = '2:3'
): GptImage2AspectRatio {
  if (!internalRatio) return fallback;
  const target = parseAspectRatioValue(internalRatio);
  if (target == null || target <= 0) return fallback;

  const targetLog = Math.log(target);
  let best = fallback;
  let bestDistance = Infinity;

  for (const candidate of GPT_IMAGE_2_ASPECT_RATIOS) {
    const candidateValue = parseAspectRatioValue(candidate);
    if (candidateValue == null || candidateValue <= 0) continue;
    const distance = Math.abs(targetLog - Math.log(candidateValue));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return best;
}
