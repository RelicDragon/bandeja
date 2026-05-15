import { SlotDetailPanel, SlotDetailPanelProps } from './SlotDetailPanel';

interface SlotDetailSheetProps extends SlotDetailPanelProps {
  open: boolean;
  layout?: 'sheet' | 'rail';
}

export function SlotDetailSheet({
  open,
  layout = 'sheet',
  slot,
  freeSlot,
  onClose,
  onBlock,
  onCancel,
  onClearCourt,
  onMessageHost,
  onReleaseHold,
  onEditHold,
  readOnly,
}: SlotDetailSheetProps) {
  if (!open) return null;

  const panel = (
    <SlotDetailPanel
      slot={slot}
      freeSlot={freeSlot}
      onClose={onClose}
      onBlock={onBlock}
      onCancel={onCancel}
      onClearCourt={onClearCourt}
      onMessageHost={onMessageHost}
      onReleaseHold={onReleaseHold}
      onEditHold={onEditHold}
      readOnly={readOnly}
    />
  );

  if (layout === 'rail') {
    return (
      <aside
        role="dialog"
        aria-modal
        className="sticky top-16 hidden h-[calc(100vh-5rem)] w-80 shrink-0 overflow-y-auto rounded-2xl border border-border bg-background p-4 shadow-sm lg:block"
      >
        {panel}
      </aside>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-3 lg:hidden" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        className="w-full max-w-md rounded-2xl border border-border bg-background p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {panel}
      </div>
    </div>
  );
}
