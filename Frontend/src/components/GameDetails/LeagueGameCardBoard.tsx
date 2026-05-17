import type { LeagueGameCardLayout } from '@/types/leagueGameCardLayout';
import type { LeagueBoardCoreProps } from '@/components/GameDetails/leagueGameCardBoardShared';
import { LeagueGameCardBoardType1 } from '@/components/GameDetails/LeagueGameCardBoardType1';
import { LeagueGameCardBoardType2 } from '@/components/GameDetails/LeagueGameCardBoardType2';
import { LeagueGameCardBoardType3 } from '@/components/GameDetails/LeagueGameCardBoardType3';

type LeagueGameCardBoardProps = LeagueBoardCoreProps & {
  layout: LeagueGameCardLayout;
};

export function LeagueGameCardBoard({ layout, ...props }: LeagueGameCardBoardProps) {
  switch (layout) {
    case 'type1':
      return <LeagueGameCardBoardType1 {...props} />;
    case 'type2':
      return <LeagueGameCardBoardType2 {...props} />;
    case 'type3':
      return <LeagueGameCardBoardType3 {...props} />;
  }
}
