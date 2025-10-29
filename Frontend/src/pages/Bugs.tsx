import { useNavigationStore } from '@/store/navigationStore';
import { BugList } from '@/components/bugs';

export const BugsContent = () => {
  const { currentPage } = useNavigationStore();
  const isVisible = currentPage === 'bugs';

  return <BugList isVisible={isVisible} />;
};
