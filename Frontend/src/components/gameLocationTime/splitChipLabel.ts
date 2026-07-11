export function splitChipLabel(label: string): { first: string; second: string | null } {
  const pipeIndex = label.indexOf('|');
  if (pipeIndex !== -1) {
    return {
      first: label.slice(0, pipeIndex),
      second: label.slice(pipeIndex + 1),
    };
  }

  const spaceIndex = label.indexOf(' ');
  if (spaceIndex !== -1) {
    return {
      first: label.slice(0, spaceIndex),
      second: label.slice(spaceIndex + 1),
    };
  }

  if (label.length > 10) {
    const mid = Math.ceil(label.length / 2);
    return {
      first: label.slice(0, mid),
      second: label.slice(mid),
    };
  }

  return { first: label, second: null };
}
