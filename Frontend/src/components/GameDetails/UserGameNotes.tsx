import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { StickyNote, Loader2 } from 'lucide-react';
import { Card } from '@/components';
import { userGameNotesApi, UserGameNote } from '@/api';

interface UserGameNotesProps {
  gameId: string;
  initialContent?: string | null;
}

export const UserGameNotes = ({ gameId, initialContent }: UserGameNotesProps) => {
  const { t } = useTranslation();
  const [note, setNote] = useState<UserGameNote | null>(initialContent ? { id: '', userId: '', gameId, content: initialContent, createdAt: '', updatedAt: '' } : null);
  const [content, setContent] = useState(initialContent || '');
  const [loading, setLoading] = useState(!initialContent);
  const [saving, setSaving] = useState(false);
  const [lastSavedContent, setLastSavedContent] = useState(initialContent || '');
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchNote = useCallback(async () => {
    try {
      setLoading(true);
      const response = await userGameNotesApi.getNote(gameId);
      const fetchedNote = response.data.data;
      setNote(fetchedNote);
      const noteContent = fetchedNote?.content || '';
      setContent(noteContent);
      setLastSavedContent(noteContent);
    } catch (error) {
      console.error('Failed to fetch note:', error);
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    if (!initialContent) fetchNote();
  }, [gameId, initialContent, fetchNote]);

  const saveNote = useCallback(async (contentToSave: string) => {
    if (!contentToSave.trim()) {
      // If content is empty and note exists, delete it
      if (note) {
        try {
          setSaving(true);
          await userGameNotesApi.deleteNote(gameId);
          setNote(null);
          setLastSavedContent('');
        } catch (error: any) {
          console.error('Failed to delete note:', error);
        } finally {
          setSaving(false);
        }
      }
      return;
    }

    try {
      setSaving(true);
      if (note) {
        const response = await userGameNotesApi.updateNote(gameId, contentToSave);
        setNote(response.data.data);
      } else {
        const response = await userGameNotesApi.createNote(gameId, contentToSave);
        setNote(response.data.data);
      }
      setLastSavedContent(contentToSave);
    } catch (error: any) {
      console.error('Failed to save note:', error);
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setSaving(false);
    }
  }, [gameId, note, t]);

  const debouncedSave = useCallback((value: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Only save if content has changed from last saved version
    if (value === lastSavedContent) {
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      saveNote(value);
    }, 1000); // 1 second debounce
  }, [saveNote, lastSavedContent]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    debouncedSave(newContent);
  };

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  if (loading) {
    return null;
  }

  return (
    <Card>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <StickyNote size={18} className="text-gray-500 dark:text-gray-400" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {t('userGameNotes.title')}
          </h2>
          {saving && (
            <Loader2 size={16} className="text-primary-600 dark:text-primary-400 animate-spin" />
          )}
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t('userGameNotes.privacyHint')}
        </p>

        <textarea
          value={content}
          onChange={handleContentChange}
          placeholder={t('userGameNotes.placeholder')}
          className="w-full min-h-[120px] px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 resize-vertical"
          maxLength={5000}
        />
      </div>
    </Card>
  );
};
