import { useState } from 'react';
import type { Sport, User } from '@/types';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { getSportQuestionnaireConfig } from '@/sport/sportQuestionnaireRegistry';
import { SportQuestionnaireContent } from './SportQuestionnaireContent';

type SportQuestionnaireSheetProps = {
  sport: Sport;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: (user: User) => void;
  modalId?: string;
  contentKey?: number | string;
};

export function SportQuestionnaireSheet({
  sport,
  open,
  onOpenChange,
  onCompleted,
  modalId,
  contentKey,
}: SportQuestionnaireSheetProps) {
  const [sessionKey, setSessionKey] = useState(0);
  const config = getSportQuestionnaireConfig(sport);
  const formKey = contentKey ?? sessionKey;

  if (!config) return null;

  return (
    <Dialog
      open={open}
      onClose={() => onOpenChange(false)}
      modalId={modalId ?? `sport-questionnaire-${sport.toLowerCase()}`}
    >
      <DialogContent className="max-w-md border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 dark:from-slate-900 dark:to-slate-950 dark:border-slate-700/90 sm:max-w-lg max-h-[min(90vh,720px)] overflow-y-auto p-6 pt-14 shadow-2xl">
        <SportQuestionnaireContent
          key={formKey}
          sport={sport}
          onRequestClose={() => onOpenChange(false)}
          onCompleted={(user) => {
            onCompleted?.(user);
            setSessionKey((k) => k + 1);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
