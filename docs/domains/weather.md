# Weather

Home-city scoped (`user.currentCity`). Calendar cells + game details.

- Preview on game/day (`useMonthCalendarWeather`, `weatherPreviewQueryOptions` / `weatherDayQueryOptions`).
- Full-day hourly dialog; archive for past days (`WeatherDayArchiveService`).
- API: `GET /weather/day?cityId&date=YYYY-MM-DD`, `GET /weather/preview?cityId&startTime&endTime&scope=game|day|forecast`. Game: `GET /games/:id/weather`.
- Scheduler: `WeatherForecastScheduler`. Forecast service non-blocking on game create/update.

Do not drive weather from Browse city.
