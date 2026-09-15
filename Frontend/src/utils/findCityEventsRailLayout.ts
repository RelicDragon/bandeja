export type FindCityEventsRailLayout = 'row' | 'carousel';

export function findCityEventsRailLayout(eventCount: number): FindCityEventsRailLayout {
  return eventCount === 1 ? 'row' : 'carousel';
}
