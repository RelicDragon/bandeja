import { useId } from 'react';
import { BadmintonCourtDiagram } from '@/components/liveScoring/rally/BadmintonCourtDiagram';
import { PadelCourtDiagram } from '@/components/liveScoring/rally/PadelCourtDiagram';
import { PickleballCourtDiagram } from '@/components/liveScoring/rally/PickleballCourtDiagram';
import { SquashCourtDiagram } from '@/components/liveScoring/rally/SquashCourtDiagram';
import { TableTennisCourtDiagram } from '@/components/liveScoring/rally/TableTennisCourtDiagram';
import { TennisCourtDiagram } from '@/components/liveScoring/rally/TennisCourtDiagram';
import { Sports, type Sport } from '@/sport/sportRegistry';

type Props = {
  sport: Sport;
  matchDoubles: boolean;
};

export function CourtLobbySportCourt({ sport, matchDoubles }: Props) {
  const reactId = useId();
  const uid = `court-lobby-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  switch (sport) {
    case Sports.TENNIS:
      return <TennisCourtDiagram uid={uid} matchDoubles={matchDoubles} />;
    case Sports.PICKLEBALL:
      return <PickleballCourtDiagram uid={uid} />;
    case Sports.BADMINTON:
      return <BadmintonCourtDiagram uid={uid} />;
    case Sports.TABLE_TENNIS:
      return <TableTennisCourtDiagram uid={uid} matchDoubles={matchDoubles} />;
    case Sports.SQUASH:
      return <SquashCourtDiagram uid={uid} />;
    case Sports.PADEL:
    default:
      return <PadelCourtDiagram uid={uid} />;
  }
}
