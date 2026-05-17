import { SegmentedSwitch } from '@/components/SegmentedSwitch';
import { LEAGUE_GAME_CARD_LAYOUTS, type LeagueGameCardLayout } from '@/types/leagueGameCardLayout';

type LeagueGameCardLayoutSwitchProps = {
  value: LeagueGameCardLayout;
  onChange: (layout: LeagueGameCardLayout) => void;
  layoutId?: string;
};

export function LeagueGameCardLayoutSwitch({
  value,
  onChange,
  layoutId = 'league-game-card-layout',
}: LeagueGameCardLayoutSwitchProps) {
  return (
    <div className="flex justify-center w-full">
      <SegmentedSwitch
        tabs={LEAGUE_GAME_CARD_LAYOUTS.map((id) => ({ id, label: id }))}
        activeId={value}
        onChange={(id) => onChange(id as LeagueGameCardLayout)}
        showOnlyActiveTabText={false}
        layoutId={layoutId}
        className="w-fit max-w-full"
      />
    </div>
  );
}
