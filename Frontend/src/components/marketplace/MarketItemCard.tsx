import { useNavigate } from 'react-router-dom';
import { MarketItem } from '@/types';
import { MapPin } from 'lucide-react';

const TRADE_TYPE_BADGE_CLASS = {
  BUY_IT_NOW: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  SUGGESTED_PRICE: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  AUCTION: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
} as const;

interface MarketItemCardProps {
  item: MarketItem;
  formatPrice: (item: MarketItem) => string;
  tradeTypeLabel: Record<string, string>;
  unreadCount?: number;
}

export const MarketItemCard = ({ item, formatPrice, tradeTypeLabel, unreadCount }: MarketItemCardProps) => {
  const navigate = useNavigate();
  const imageUrl = item.mediaUrls?.[0];

  const handleClick = () => {
    if (item.groupChannel?.id) {
      navigate(`/channel-chat/${item.groupChannel.id}`, { state: { fromPage: 'marketplace' } });
    } else {
      navigate(`/marketplace/${item.id}`);
    }
  };

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      className="group relative overflow-hidden rounded-xl bg-white dark:bg-slate-800/80 border border-gray-200 dark:border-slate-600 shadow-sm dark:shadow-black/20 hover:shadow-lg dark:hover:shadow-black/30 hover:border-primary-200 dark:hover:border-primary-700/50 transition-all duration-300 active:scale-[0.98] cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 flex flex-col"
    >
      {imageUrl && (
        <div className="aspect-square bg-slate-100 dark:bg-slate-700/80 overflow-hidden relative flex-shrink-0">
          <img
            src={imageUrl}
            alt={item.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          {item.mediaUrls && item.mediaUrls.length > 1 && (
            <div className="absolute bottom-1 right-1 px-1.5 py-px rounded-full bg-black/60 dark:bg-black/70 text-white text-[10px] font-medium">
              {item.mediaUrls.length}
            </div>
          )}
        </div>
      )}
      {unreadCount != null && unreadCount > 0 && (
        <div className="absolute top-1.5 right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shadow-lg shadow-red-500/30 z-10">
          {unreadCount > 99 ? '99+' : unreadCount}
        </div>
      )}
      <div className="p-2 mt-auto">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{item.title}</p>
        <p className="text-sm font-semibold text-primary-600 dark:text-primary-400 mt-0.5">
          {formatPrice(item)}
        </p>
        <div className="flex items-center gap-1 mt-1 flex-wrap">
          {(item.tradeTypes ?? []).filter((tt) => tt !== 'BUY_IT_NOW').map((tt) => (
            <span
              key={tt}
              className={`px-1.5 py-0.5 rounded text-xs font-medium ${TRADE_TYPE_BADGE_CLASS[tt as keyof typeof TRADE_TYPE_BADGE_CLASS] || 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-300'}`}
            >
              {tradeTypeLabel[tt] || tt}
            </span>
          ))}
          {item.city && (
            <span className="flex items-center gap-0.5 text-xs text-slate-500 dark:text-slate-400">
              <MapPin size={12} />
              {item.city.name}
            </span>
          )}
        </div>
      </div>
    </article>
  );
};
