import { ServeCourtSchema, type ServeCourtSchemaProps } from './ServeCourtSchema';

export function TennisServeCourtSchema(props: ServeCourtSchemaProps) {
  return <ServeCourtSchema {...props} variant="tennis" />;
}
