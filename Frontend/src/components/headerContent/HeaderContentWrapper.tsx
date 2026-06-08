import { ReactNode, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useShellNavStore } from '@/store/shellNavStore';
import { isChatShellPlace, parseLocation, type Place } from '@/utils/urlSchema';

interface HeaderContentWrapperProps {
  children: ReactNode;
  page: 'my' | 'find' | 'chats' | 'bugs' | 'profile' | 'leaderboard' | 'gameDetails' | 'gameSubscriptions';
}

function placeMatchesHeaderPage(place: Place, page: HeaderContentWrapperProps['page']): boolean {
  switch (page) {
    case 'my':
      return place === 'home';
    case 'find':
      return place === 'find';
    case 'chats':
      return isChatShellPlace(place);
    case 'bugs':
      return place === 'bugs';
    case 'profile':
      return place === 'profile';
    case 'leaderboard':
      return place === 'leaderboard';
    case 'gameDetails':
      return place === 'game';
    case 'gameSubscriptions':
      return place === 'gameSubscriptions';
    default:
      return false;
  }
}

export const HeaderContentWrapper = ({ children, page }: HeaderContentWrapperProps) => {
  const location = useLocation();
  const isAnimating = useShellNavStore((s) => s.isAnimating);
  const parsed = useMemo(
    () => parseLocation(location.pathname, location.search),
    [location.pathname, location.search]
  );
  const isActive = placeMatchesHeaderPage(parsed.place, page) && !isAnimating;

  return (
    <div className={`transition-all duration-300 ease-in-out ${
      isActive
        ? 'opacity-100 transform translate-x-0 relative'
        : 'opacity-0 transform translate-x-4 pointer-events-none absolute'
    }`}>
      {children}
    </div>
  );
};
