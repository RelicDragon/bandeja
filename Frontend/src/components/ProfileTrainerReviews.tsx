import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { ReviewsList } from '@/components/ReviewsList';

export const ProfileTrainerReviews = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  if (!user?.id || !user?.isTrainer) return null;

  return (
    <ReviewsList
      trainerId={user.id}
      initialSummary={{ rating: user.trainerRating ?? null, reviewCount: user.trainerReviewCount ?? 0 }}
      onReviewClick={(gameId) => navigate(`/games/${gameId}`)}
      showSummary
      summaryTitleKey="profile.review"
      showTitle
      titleKey="profile.allReviews"
    />
  );
};
