import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { enUS, ru, es, sr, Locale } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2, MapPin } from 'lucide-react';
import { Button, Card, ConfirmationModal } from '@/components';
import { GameSubscriptionForm } from '@/components/GameSubscriptionForm';
import { useAuthStore } from '@/store/authStore';
import { useNavigationStore } from '@/store/navigationStore';
import { gameSubscriptionsApi, GameSubscription, CreateSubscriptionDto, UpdateSubscriptionDto } from '@/api/gameSubscriptions';
import { clubsApi } from '@/api';
import { Club } from '@/types';
import { EntityType } from '@/types';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { RefreshIndicator } from '@/components/RefreshIndicator';
import { clearCachesExceptUnsyncedResults } from '@/utils/cacheUtils';
import { resolveDisplaySettings } from '@/utils/displayPreferences';

const localeMap: Record<string, Locale> = {
  en: enUS,
  ru: ru,
  es: es,
  sr: sr,
};

export const GameSubscriptionsContent = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { setCurrentPage, setIsAnimating } = useNavigationStore();
  const [subscriptions, setSubscriptions] = useState<GameSubscription[]>([]);
  const [clubsMap, setClubsMap] = useState<Record<string, Club>>({});
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteSubscriptionId, setDeleteSubscriptionId] = useState<string | null>(null);
  
  const locale = useMemo(() => localeMap[i18n.language as keyof typeof localeMap] || enUS, [i18n.language]);
  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);

  const fetchSubscriptions = useCallback(async () => {
    try {
      const response = await gameSubscriptionsApi.getSubscriptions();
      setSubscriptions(response.data);
      
      const uniqueCityIds = [...new Set(response.data.map(s => s.cityId))];
      const clubsMap: Record<string, Club> = {};
      
      for (const cityId of uniqueCityIds) {
        try {
          const clubsResponse = await clubsApi.getByCityId(cityId);
          clubsResponse.data.forEach(club => {
            clubsMap[club.id] = club;
          });
        } catch (error) {
          console.error(`Failed to fetch clubs for city ${cityId}:`, error);
        }
      }
      
      setClubsMap(clubsMap);
    } catch (error: any) {
      console.error('Failed to fetch subscriptions:', error);
      toast.error(error.response?.data?.message || t('errors.generic'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    setShowForm(false);
    setEditingId(null);
  }, []);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  const handleCreate = async (data: CreateSubscriptionDto) => {
    try {
      await gameSubscriptionsApi.createSubscription(data);
      toast.success(t('gameSubscriptions.subscriptionCreated') || 'Subscription created');
      setShowForm(false);
      await fetchSubscriptions();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('errors.generic'));
      throw error;
    }
  };

  const handleUpdate = async (id: string, data: UpdateSubscriptionDto) => {
    try {
      await gameSubscriptionsApi.updateSubscription(id, data);
      toast.success(t('gameSubscriptions.subscriptionUpdated') || 'Subscription updated');
      setEditingId(null);
      await fetchSubscriptions();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('errors.generic'));
      throw error;
    }
  };

  const handleDeleteClick = (id: string) => {
    setDeleteSubscriptionId(id);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteSubscriptionId) return;

    try {
      await gameSubscriptionsApi.deleteSubscription(deleteSubscriptionId);
      toast.success(t('gameSubscriptions.subscriptionDeleted') || 'Subscription deleted');
      setDeleteSubscriptionId(null);
      await fetchSubscriptions();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('errors.generic'));
    }
  };

  const handleRefresh = useCallback(async () => {
    await clearCachesExceptUnsyncedResults();
    await fetchSubscriptions();
  }, [fetchSubscriptions]);

  const { isRefreshing, pullDistance, pullProgress } = usePullToRefresh({
    onRefresh: handleRefresh,
    disabled: loading,
  });

  const formatDays = (days: number[]) => {
    if (days.length === 0) return t('gameSubscriptions.allDays') || 'All days';
    if (days.length === 7) return t('gameSubscriptions.allDays') || 'All days';
    return days.map(d => {
      const date = new Date(2024, 0, 7 + d);
      const dayName = format(date, 'EEEE', { locale });
      return dayName.charAt(0).toUpperCase() + dayName.slice(1);
    }).join(', ');
  };

  const formatEntityTypes = (types: string[]) => {
    if (!types || types.length === 0) {
      return t('gameSubscriptions.allEntityTypes') || 'All game types';
    }
    return types.map(type => t(`games.entityTypes.${type}`) || type).join(', ');
  };

  const formatTimeString = (time: string): string => {
    if (!time) return '';
    if (time === '24:00') {
      return displaySettings.hour12 ? '12:00am' : '24:00';
    }
    const [hours, minutes] = time.split(':').map(Number);
    if (displaySettings.hour12) {
      const period = hours >= 12 ? 'pm' : 'am';
      const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
      return `${displayHours}:${String(minutes).padStart(2, '0')}${period}`;
    } else {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <>
      <RefreshIndicator
        isRefreshing={isRefreshing}
        pullDistance={pullDistance}
        pullProgress={pullProgress}
      />
      <div
        style={{
          transform: `translateY(${pullDistance}px)`,
          transition: pullDistance > 0 && !isRefreshing ? 'none' : 'transform 0.3s ease-out',
        }}
      >
        <div className="space-y-6 pt-0">
          {showForm && (
            <GameSubscriptionForm
              userCityId={user?.currentCityId}
              onSave={handleCreate}
              onCancel={() => setShowForm(false)}
            />
          )}

          {subscriptions.length === 0 && !showForm && !editingId && (
            <Card className="text-center py-12">
              <p className="text-gray-600 dark:text-gray-400">
                {t('gameSubscriptions.noSubscriptions') || 'No subscriptions yet'}
              </p>
            </Card>
          )}

          {subscriptions.map(subscription => {
            if (editingId === subscription.id) {
              return (
                <GameSubscriptionForm
                  key={subscription.id}
                  subscription={subscription}
                  userCityId={user?.currentCityId}
                  onSave={(data) => handleUpdate(subscription.id, data)}
                  onCancel={() => setEditingId(null)}
                />
              );
            }

            return (
              <Card key={subscription.id} className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <MapPin size={16} className="text-gray-600 dark:text-gray-400 flex-shrink-0" />
                      <span className="text-sm text-gray-900 dark:text-white">
                        {subscription.city?.name || subscription.cityId}
                      </span>
                    </div>

                    {subscription.clubIds.length > 0 && (
                      <div>
                        <span className="text-sm text-gray-900 dark:text-white">
                          {subscription.clubIds
                            .map(id => clubsMap[id]?.name || id)
                            .filter(Boolean)
                            .join(', ')}
                        </span>
                      </div>
                    )}

                    {subscription.entityTypes && subscription.entityTypes.length > 0 && (
                      <div>
                        <span className="text-sm text-gray-900 dark:text-white">
                          {formatEntityTypes(subscription.entityTypes)}
                        </span>
                      </div>
                    )}

                    {subscription.dayOfWeek && subscription.dayOfWeek.length > 0 && (
                      <div>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {t('gameSubscriptions.daysOfWeek')}:{' '}
                        </span>
                        <span className="text-sm text-gray-900 dark:text-white">
                          {formatDays(subscription.dayOfWeek)}
                        </span>
                      </div>
                    )}

                    {(subscription.startDate || subscription.endDate) && (
                      <div>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {t('gameSubscriptions.date')}:{' '}
                        </span>
                        <span className="text-sm text-gray-900 dark:text-white">
                          {subscription.startDate
                            ? format(new Date(subscription.startDate), 'PPP', { locale })
                            : '...'}{' '}
                          -{' '}
                          {subscription.endDate
                            ? format(new Date(subscription.endDate), 'PPP', { locale })
                            : '...'}
                        </span>
                      </div>
                    )}

                    {(subscription.startTime || subscription.endTime) && (
                      <div>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {t('gameSubscriptions.timeRange')}:{' '}
                        </span>
                        <span className="text-sm text-gray-900 dark:text-white">
                          {subscription.startTime
                            ? formatTimeString(subscription.startTime)
                            : '...'}{' '}
                          -{' '}
                          {subscription.endTime
                            ? formatTimeString(subscription.endTime)
                            : '...'}
                        </span>
                      </div>
                    )}

                    {(() => {
                      const minLevel = subscription.minLevel ?? 1.0;
                      const maxLevel = subscription.maxLevel ?? 7.0;
                      const isDefaultRange = minLevel === 1.0 && maxLevel === 7.0;
                      return !isDefaultRange && (subscription.minLevel != null || subscription.maxLevel != null);
                    })() && (
                      <div>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {t('gameSubscriptions.level')}:{' '}
                        </span>
                        <span className="text-sm text-gray-900 dark:text-white">
                          {subscription.minLevel != null ? subscription.minLevel.toFixed(1) : '...'} -{' '}
                          {subscription.maxLevel != null ? subscription.maxLevel.toFixed(1) : '...'}
                        </span>
                      </div>
                    )}

                    {subscription.myGenderOnly && (
                      <div>
                        <span className="text-sm text-gray-900 dark:text-white">
                          {t('gameSubscriptions.myGenderOnly')}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => setEditingId(subscription.id)}
                      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      title={t('gameSubscriptions.editSubscription') || 'Edit'}
                    >
                      <Edit2 size={18} className="text-gray-600 dark:text-gray-400" />
                    </button>
                    <button
                      onClick={() => handleDeleteClick(subscription.id)}
                      className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                      title={t('gameSubscriptions.deleteSubscription') || 'Delete'}
                    >
                      <Trash2 size={18} className="text-red-600 dark:text-red-400" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {!showForm && !editingId && (
          <div className="flex justify-center pt-4">
            <Button
              variant="primary"
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2"
            >
              <Plus size={16} />
              {t('gameSubscriptions.addSubscription') || 'Add Subscription'}
            </Button>
          </div>
        )}
      </div>

      <ConfirmationModal
        isOpen={deleteSubscriptionId !== null}
        onClose={() => setDeleteSubscriptionId(null)}
        onConfirm={handleDeleteConfirm}
        title={t('gameSubscriptions.deleteSubscription') || 'Delete Subscription'}
        message={t('gameSubscriptions.confirmDelete') || 'Are you sure you want to delete this subscription?'}
        confirmText={t('common.delete') || 'Delete'}
        cancelText={t('common.cancel') || 'Cancel'}
        confirmVariant="danger"
      />
    </>
  );
};

