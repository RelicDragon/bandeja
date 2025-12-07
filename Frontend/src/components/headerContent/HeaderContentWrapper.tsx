import { ReactNode } from 'react';
import { useNavigationStore } from '@/store/navigationStore';

interface HeaderContentWrapperProps {
  children: ReactNode;
  page: 'home' | 'profile' | 'gameDetails' | 'bugs';
}

export const HeaderContentWrapper = ({ children, page }: HeaderContentWrapperProps) => {
  const { currentPage, isAnimating } = useNavigationStore();
  
  const isActive = currentPage === page && !isAnimating;
  
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


