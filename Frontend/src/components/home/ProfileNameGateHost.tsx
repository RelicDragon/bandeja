import { NameSetModal } from './NameSetModal';
import { useProfileNameGateStore } from '@/store/profileNameGateStore';

export function ProfileNameGateHost() {
  const isOpen = useProfileNameGateStore((s) => s.isOpen);
  const dismiss = useProfileNameGateStore((s) => s.dismiss);
  const resolveSaved = useProfileNameGateStore((s) => s.resolveSaved);

  return (
    <NameSetModal
      open={isOpen}
      onClose={dismiss}
      onSaved={() => {
        const run = resolveSaved();
        if (run) void Promise.resolve(run());
      }}
    />
  );
}
