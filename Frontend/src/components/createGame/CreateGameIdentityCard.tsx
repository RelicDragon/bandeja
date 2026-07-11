import { useTranslation } from 'react-i18next';
import { AvatarUpload } from '@/components/AvatarUpload';
import { GameNameInput } from './GameNameInput';
import type { EntityType } from '@/types';

interface CreateGameIdentityCardProps {
  entityType: EntityType;
  gameName: string;
  onGameNameChange: (name: string) => void;
  avatarPreviewUrl?: string;
  onAvatarUpload: (avatarFile: File, originalFile: File) => Promise<void>;
  onAvatarRemove: () => Promise<void>;
  disabled?: boolean;
}

export const CreateGameIdentityCard = ({
  entityType,
  gameName,
  onGameNameChange,
  avatarPreviewUrl,
  onAvatarUpload,
  onAvatarRemove,
  disabled = false,
}: CreateGameIdentityCardProps) => {
  const { t } = useTranslation();

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <div className="flex items-center gap-4">
        <AvatarUpload
          currentAvatar={avatarPreviewUrl}
          onUpload={onAvatarUpload}
          onRemove={onAvatarRemove}
          disabled={disabled}
          isGameAvatar={true}
          sizeClassName="h-20 w-20 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
              {t('createGame.identity.label')}
            </label>
            <span className="text-[11px] text-gray-400 dark:text-gray-500">
              {t('createGame.identity.optional')}
            </span>
          </div>
          <GameNameInput value={gameName} onChange={onGameNameChange} entityType={entityType} />
        </div>
      </div>
    </div>
  );
};
