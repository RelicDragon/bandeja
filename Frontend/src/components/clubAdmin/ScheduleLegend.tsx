import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { slotClassName, SlotVisualKind } from '@/utils/clubSchedule/slotStyle';
import { readLegendCollapsed, writeLegendCollapsed } from '@/utils/clubSchedule/legendStorage';

const LEGEND_ITEMS: SlotVisualKind[] = [
  'free',
  'game_confirmed',
  'game_planned',
  'unassigned',
  'external',
  'hold',
  'inactive',
];

const LABEL_KEYS: Record<SlotVisualKind, string> = {
  free: 'clubAdmin.legend.free',
  game_confirmed: 'clubAdmin.legend.confirmed',
  game_planned: 'clubAdmin.legend.planned',
  unassigned: 'clubAdmin.legend.unassigned',
  external: 'clubAdmin.legend.external',
  hold: 'clubAdmin.legend.hold',
  inactive: 'clubAdmin.legend.inactive',
};

export function ScheduleLegend() {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(readLegendCollapsed);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    writeLegendCollapsed(next);
  };

  return (
    <div className="mb-2 rounded-lg border border-border bg-muted/30">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium"
        onClick={toggle}
      >
        {t('clubAdmin.legend.title')}
        {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
      </button>
      {!collapsed && (
        <div className="flex flex-wrap gap-2 border-t border-border px-3 py-2">
          {LEGEND_ITEMS.map((kind) => (
            <div key={kind} className="flex items-center gap-1.5 text-xs">
              <span className={`inline-block h-4 w-6 ${slotClassName(kind)}`} />
              <span>{t(LABEL_KEYS[kind])}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
