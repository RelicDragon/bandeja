export function getWeatherDayChartRainBarGeometry(pointX: number, pointCount: number): { x: number; width: number } {
  const width = Math.max(1.8, 70 / pointCount);
  return {
    x: pointX - width / 2,
    width,
  };
}
