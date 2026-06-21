import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { useUserGameNoteQuery } from '@/queries/userGameNotes/useUserGameNoteQuery';
import { useSaveUserGameNoteMutation } from '@/queries/userGameNotes/useSaveUserGameNoteMutation';

const SAVE_DEBOUNCE_MS = 800;

export type UserNoteVisualMode = 'placeholder' | 'editing' | 'display';

function resolveVisualMode(content: string): UserNoteVisualMode {
  return content.trim() ? 'display' : 'placeholder';
}

export function useGameInfoUserNote(gameId: string, seedContent?: string | null) {
  const { data: serverNote, isLoading, isPlaceholderData } = useUserGameNoteQuery(gameId, seedContent);
  const saveMutation = useSaveUserGameNoteMutation(gameId);

  const initialContent = seedContent?.trim() ? seedContent : '';
  const [draft, setDraft] = useState(initialContent);
  const [visualMode, setVisualMode] = useState<UserNoteVisualMode>(() => resolveVisualMode(initialContent));

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const shouldFocusRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);
  const savedContentRef = useRef(seedContent?.trim() ?? '');
  const visualModeRef = useRef(visualMode);

  draftRef.current = draft;
  visualModeRef.current = visualMode;

  useEffect(() => {
    shouldFocusRef.current = false;
    const content = seedContent?.trim() ? seedContent : '';
    setDraft(content);
    setVisualMode(resolveVisualMode(content));
    savedContentRef.current = seedContent?.trim() ?? '';
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, [gameId, seedContent]);

  useEffect(() => {
    if (isPlaceholderData || visualMode === 'editing') return;
    const content = serverNote?.content ?? '';
    setDraft(content);
    setVisualMode(resolveVisualMode(content));
    savedContentRef.current = content.trim();
  }, [gameId, serverNote?.content, isPlaceholderData, visualMode]);

  const commit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (trimmed === savedContentRef.current) return;
      if (!trimmed && !savedContentRef.current) return;

      saveMutation.mutate(value, {
        onSuccess: (note) => {
          savedContentRef.current = note?.content?.trim() ?? '';
        },
      });
    },
    [saveMutation],
  );

  const flushSave = useCallback((value = draftRef.current) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    commit(value);
  }, [commit]);

  const flushSaveRef = useRef(flushSave);
  flushSaveRef.current = flushSave;

  const scheduleSave = useCallback(
    (value: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (value.trim() === savedContentRef.current) return;
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        commit(value);
      }, SAVE_DEBOUNCE_MS);
    },
    [commit],
  );

  const activate = useCallback(() => {
    shouldFocusRef.current = true;
    setVisualMode('editing');
  }, []);

  useLayoutEffect(() => {
    if (!shouldFocusRef.current || visualMode !== 'editing') return;
    shouldFocusRef.current = false;
    const el = textareaRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, [visualMode]);

  const handleChange = useCallback(
    (value: string) => {
      setDraft(value);
      scheduleSave(value);
    },
    [scheduleSave],
  );

  const handleFocus = useCallback(() => {
    setVisualMode('editing');
  }, []);

  const handleBlur = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed !== draft) setDraft(trimmed);
    flushSave(trimmed);
    setVisualMode(resolveVisualMode(trimmed));
  }, [draft, flushSave]);

  useEffect(() => {
    const flushOnHide = () => {
      if (document.visibilityState === 'hidden') flushSaveRef.current();
    };
    document.addEventListener('visibilitychange', flushOnHide);
    return () => {
      document.removeEventListener('visibilitychange', flushOnHide);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      flushSaveRef.current();
    };
  }, []);

  return {
    loading: isLoading,
    saving: saveMutation.isPending,
    content: draft,
    visualMode,
    textareaRef,
    activate,
    handleChange,
    handleFocus,
    handleBlur,
  };
};
