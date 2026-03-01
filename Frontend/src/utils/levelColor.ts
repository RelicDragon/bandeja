const COLOR_STOPS: Array<{ level: number; rgb: [number, number, number] }> = [
  { level: 0, rgb: [59, 130, 246] },
  { level: 2, rgb: [34, 197, 94] },
  { level: 3, rgb: [234, 179, 8] },
  { level: 4, rgb: [249, 115, 22] },
  { level: 5, rgb: [239, 68, 68] },
  { level: 6, rgb: [245, 158, 11] },
  { level: 7, rgb: [168, 85, 247] },
];

function interpolateRgb(
  start: [number, number, number],
  end: [number, number, number],
  t: number
): [number, number, number] {
  return [
    Math.round(start[0] + (end[0] - start[0]) * t),
    Math.round(start[1] + (end[1] - start[1]) * t),
    Math.round(start[2] + (end[2] - start[2]) * t),
  ];
}

function getRgbForLevel(level: number, isDark: boolean): [number, number, number] {
  const levelValue = Math.max(0, Math.min(7, level));
  const darkMultiplier = isDark ? 0.85 : 1;

  let rgb: [number, number, number];
  if (levelValue <= COLOR_STOPS[0].level) {
    rgb = COLOR_STOPS[0].rgb;
  } else if (levelValue >= COLOR_STOPS[COLOR_STOPS.length - 1].level) {
    rgb = COLOR_STOPS[COLOR_STOPS.length - 1].rgb;
  } else {
    rgb = COLOR_STOPS[0].rgb;
    for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
      const current = COLOR_STOPS[i];
      const next = COLOR_STOPS[i + 1];
      if (levelValue >= current.level && levelValue <= next.level) {
        const t = (levelValue - current.level) / (next.level - current.level);
        rgb = interpolateRgb(current.rgb, next.rgb, t);
        break;
      }
    }
  }
  return [
    Math.round(rgb[0] * darkMultiplier),
    Math.round(rgb[1] * darkMultiplier),
    Math.round(rgb[2] * darkMultiplier),
  ];
}

export function getLevelColor(level: number, isDark = false): { backgroundColor: string; ringColor: string } {
  const [r, g, b] = getRgbForLevel(level, isDark);
  return {
    backgroundColor: `rgb(${r}, ${g}, ${b})`,
    ringColor: `rgba(${r}, ${g}, ${b}, 0.7)`,
  };
}
