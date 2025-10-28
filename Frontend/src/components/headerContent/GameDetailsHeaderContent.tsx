import { MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components';

interface GameDetailsHeaderContentProps {
  canAccessChat: boolean;
}

export const GameDetailsHeaderContent = ({ canAccessChat }: GameDetailsHeaderContentProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const handleChatClick = () => {
    if (id) {
      navigate(`/games/${id}/chat`);
    }
  };

  if (!canAccessChat) {
    return null;
  }

  return (
    <Button
      onClick={handleChatClick}
      variant="primary"
      size="sm"
      className="flex items-center gap-2"
    >
      <MessageCircle size={16} />
      {t('nav.chat')}
    </Button>
  );
};

