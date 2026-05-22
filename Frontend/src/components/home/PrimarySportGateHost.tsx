import { useAuthStore } from '@/store/authStore';
import { needsPrimarySportSelection } from '@/utils/needsPrimarySportSelection';
import { PrimarySportSetModal } from './PrimarySportSetModal';

export function PrimarySportGateHost() {
  const user = useAuthStore((s) => s.user);
  const open = needsPrimarySportSelection(user);

  return <PrimarySportSetModal open={open} />;
}
