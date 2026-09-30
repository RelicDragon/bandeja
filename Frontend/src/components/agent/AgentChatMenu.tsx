import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, Pencil, ShieldCheck } from 'lucide-react';
import { openAgentPermissionsScreen } from '@/queries/agent/useAgentPermissions';
import { Drawer, DrawerCloseButton, DrawerContent, DrawerHandle } from '@/components/ui/Drawer';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/Button';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';

const SHEET_ID = 'agent-chat-menu-sheet';
const TITLE_MAX = 120;

interface AgentChatMenuSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  onRename: () => void;
  onArchive: () => void;
}

/** ⋯ sheet for one AI chat (header menu and list long-press share it). */
export function AgentChatMenuSheet({ open, title, onClose, onRename, onArchive }: AgentChatMenuSheetProps) {
  const { t } = useTranslation();
  useBackButtonModal(open, onClose, SHEET_ID);
  const row =
    'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start text-[15px] transition-colors hover:bg-gray-50 active:bg-gray-100 dark:hover:bg-gray-800 dark:active:bg-gray-800';

  return (
    <Drawer open={open} handleOnly onOpenChange={(next) => !next && onClose()}>
      <DrawerContent className="flex flex-col overflow-hidden bg-white dark:bg-gray-900" aria-labelledby={`${SHEET_ID}-title`}>
        <DrawerHandle className="relative mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-gray-300/90 dark:bg-gray-600" />
        <div data-overlay-chrome="" className="flex shrink-0 items-center gap-3 px-4 pb-2 pt-3">
          <h2
            id={`${SHEET_ID}-title`}
            className="min-w-0 flex-1 truncate text-start text-lg font-semibold text-gray-900 dark:text-white"
            dir="auto"
          >
            {title}
          </h2>
          <DrawerCloseButton aria-label={t('common.close')} className="shrink-0" />
        </div>
        <div className="flex flex-col px-2" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <button type="button" className={`${row} text-gray-900 dark:text-white`} onClick={onRename}>
            <Pencil size={18} aria-hidden />
            {t('agent.menu.rename')}
          </button>
          <button
            type="button"
            className={`${row} text-gray-900 dark:text-white`}
            onClick={() => {
              onClose();
              openAgentPermissionsScreen();
            }}
          >
            <ShieldCheck size={18} aria-hidden />
            {t('agent.permissions.title')}
          </button>
          <button type="button" className={`${row} text-red-600 dark:text-red-400`} onClick={onArchive}>
            <Archive size={18} aria-hidden />
            {t('agent.menu.archive')}
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

interface AgentRenameDialogProps {
  open: boolean;
  initialTitle: string;
  saving: boolean;
  onClose: () => void;
  onSave: (title: string) => void;
}

export function AgentRenameDialog({ open, initialTitle, saving, onClose, onSave }: AgentRenameDialogProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialTitle);
  useEffect(() => {
    if (open) setValue(initialTitle);
  }, [open, initialTitle]);
  const trimmed = value.trim();

  return (
    <Dialog open={open} onClose={onClose} modalId="agent-rename-dialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('agent.menu.renameTitle')}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (trimmed && !saving) onSave(trimmed);
          }}
        >
          <input
            value={value}
            onChange={(e) => setValue(e.target.value.slice(0, TITLE_MAX))}
            maxLength={TITLE_MAX}
            dir="auto"
            placeholder={t('agent.newChat')}
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[15px] text-gray-900 outline-none focus:border-primary-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
          <DialogFooter>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={!trimmed || saving}>
                {t('common.save')}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
