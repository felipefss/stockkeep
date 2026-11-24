import { ArrowRight, Plus } from 'lucide-react';
import { useI18n } from '../i18n';
import type { FoodGroup, PantryItem } from '../types';
import { summarizeByFoodGroup } from '../utils/inventory';

interface FoodGroupsViewProps {
  items: PantryItem[];
  thresholdDays: number;
  onAddToGroup: (group: FoodGroup) => void;
  onInspectGroup: (group: FoodGroup) => void;
}

export function FoodGroupsView({
  items,
  thresholdDays,
  onAddToGroup,
  onInspectGroup,
}: FoodGroupsViewProps) {
  const { t, tGroup, tGroupDesc, formatNumber } = useI18n();
  const summaries = summarizeByFoodGroup(items, thresholdDays);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
      {summaries.map((group) => {
        const barColor =
          group.itemCount === 0
            ? 'bg-slate-300 dark:bg-slate-700'
            : group.adequacyPct >= 100
              ? 'bg-emerald-600 dark:bg-emerald-500'
              : group.adequacyPct >= 65
                ? 'bg-amber-500 dark:bg-amber-400'
                : 'bg-red-600 dark:bg-red-500';

        const soonestLabel =
          group.soonestDays === null
            ? t('noStock')
            : group.soonestDays < 0
              ? t('statusExpiredAgo', { days: Math.abs(group.soonestDays) })
              : group.soonestDays === 0
                ? t('statusExpiresToday')
                : t('statusDaysLeft', { days: group.soonestDays });

        return (
          <div
            key={group.foodGroup}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {tGroup(group.foodGroup)}
                </h3>
                <span className="font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100 shrink-0">
                  {group.adequacyPct}%
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                {tGroupDesc(group.foodGroup)}
              </p>

              <div className="mt-4 h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-sm overflow-hidden">
                <div
                  className={`h-full ${barColor} transition-all duration-200`}
                  style={{ width: `${group.adequacyPct}%` }}
                />
              </div>

              <dl className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">{t('colStockTarget')}</dt>
                  <dd className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                    {t('chartUnitsOf', {
                      qty: group.totalQuantity,
                      target: group.totalTarget || '—',
                    })}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">{t('kpiCalorieReserve')}</dt>
                  <dd className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                    {formatNumber(Math.round(group.totalCalories))} kcal
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">{t('tabActive')}</dt>
                  <dd className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                    {group.itemCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">{t('soonestExpiration')}</dt>
                  <dd
                    className={`font-mono font-semibold tabular-nums mt-0.5 ${
                      group.soonestDays === null
                        ? 'text-slate-400'
                        : group.soonestDays < 0
                          ? 'text-red-600 dark:text-red-400'
                          : group.soonestDays <= thresholdDays
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {soonestLabel}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => onInspectGroup(group.foodGroup)}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white whitespace-nowrap"
              >
                <span>{t('inspectItems')}</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => onAddToGroup(group.foodGroup)}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-md hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t('addItem')}</span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
