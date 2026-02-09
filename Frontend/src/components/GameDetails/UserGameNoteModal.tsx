import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog';
import { Button } from '@/components';
import { userGameNotesApi } from '@/api/userGameNotes';
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
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const end = el.value.length;
      el.setSelectionRange(end, end);
    });
  }, [isOpen]);

  const handleSave = async () => {
    const trimmed = content.trim();
    setSaving(true);
    try {
      if (trimmed) {
        await userGameNotesApi.upsertNote(gameId, trimmed);
      } else {
        try {
          await userGameNotesApi.deleteNote(gameId);
        } catch (e: any) {
          if (e?.response?.status !== 404) throw e;
        }
      }
      onSaved?.(trimmed || null);
      onClose();
    } catch (error: any) {
      const msg = error.response?.data?.message || 'errors.generic';
      toast.error(t(msg, { defaultValue: msg }));
    } finally {
      setSaving(false);
    }
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
            className="w-full min-h-[120px] px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 resize-vertical"
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
