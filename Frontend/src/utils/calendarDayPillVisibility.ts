export interface CalendarDayPillVisibility {
  showWeatherPill: boolean;
  showTypePill: boolean;
}

export function resolveCalendarDayPillVisibility(params: {
  weatherMode: boolean;
  hasGames: boolean;
  typePillCount: number;
  dayWeather: unknown | null;
}): CalendarDayPillVisibility {
  const hasTypePill = params.hasGames && params.typePillCount > 0;
  const showWeatherPill = params.weatherMode && params.dayWeather != null;
  const showTypePill = hasTypePill && !showWeatherPill && (
    !params.weatherMode || params.dayWeather == null
  );

  return { showWeatherPill, showTypePill };
}
