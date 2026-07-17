import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog';
import { Button } from '@/components';
import { useSaveUserGameNoteMutation } from '@/queries/userGameNotes/useSaveUserGameNoteMutation';
import { Loader2 } from 'lucide-react';

interface UserGameNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  gameId: string;
  initialContent?: string | null;
  onSaved?: (content: string | null) => void;
}

export const UserGameNoteModal = ({
  isOpen,
  onClose,
  gameId,
  initialContent,
  onSaved,
}: UserGameNoteModalProps) => {
  const { t } = useTranslation();
  const [content, setContent] = useState(initialContent || '');
  const saveMutation = useSaveUserGameNoteMutation(gameId);
  const saving = saveMutation.isPending;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const minHeight = 40;
    const maxHeight = 320;
    el.style.height = '0px';
    const contentHeight = el.scrollHeight;
    el.style.height = `${Math.min(maxHeight, Math.max(minHeight, contentHeight))}px`;
    el.style.overflowY = contentHeight > maxHeight ? 'auto' : 'hidden';
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [content, adjustHeight]);

  useEffect(() => {
    if (!isOpen) return;
    setContent(initialContent || '');
  }, [isOpen, initialContent]);

  useEffect(() => {
    if (!isOpen) return;
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      adjustHeight();
      el.focus();
      const end = el.value.length;
      el.setSelectionRange(end, end);
    });
  }, [isOpen, adjustHeight]);

  const handleSave = () => {
    const trimmed = content.trim();
    saveMutation.mutate(trimmed, {
      onSuccess: () => {
        onSaved?.(trimmed || null);
        onClose();
      },
    });
  };

  const handleClose = () => {
    if (!saving) onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !saving) {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <Dialog open={isOpen} onClose={handleClose} modalId="user-game-note-modal">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('userGameNotes.title')}</DialogTitle>
        </DialogHeader>
        <div className="p-6 pt-4 space-y-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('userGameNotes.privacyHint')}
          </p>
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('userGameNotes.placeholder')}
            rows={1}
            className="w-full min-h-[2.5rem] max-h-80 box-border px-4 py-3 overflow-hidden scrollbar-auto bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 focus:border-primary-500 dark:focus:border-primary-400 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 resize-none"
            maxLength={5000}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
