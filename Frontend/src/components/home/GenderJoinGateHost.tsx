import { GenderSetModal } from './GenderSetModal';
import { useGenderJoinGateStore } from '@/store/genderJoinGateStore';

export function GenderJoinGateHost() {
  const isOpen = useGenderJoinGateStore((s) => s.isOpen);
  const dismiss = useGenderJoinGateStore((s) => s.dismiss);
  const resolveSaved = useGenderJoinGateStore((s) => s.resolveSaved);

  return (
    <GenderSetModal
      open={isOpen}
      variant="join"
      onClose={dismiss}
      onSaved={() => {
        const run = resolveSaved();
        if (run) void Promise.resolve(run());
      }}
    />
  );
}
