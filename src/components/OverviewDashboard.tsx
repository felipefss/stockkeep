import { ArrowRight, Bell, Check, Edit2, Minus, Plus, RotateCcw } from 'lucide-react';
import { useI18n } from '../i18n';
import type { FoodGroup, PantryItem, UserProfile } from '../types';
import { getDaysRemaining } from '../utils/inventory';
import { ExpirationStatusLabel } from './StatusLabel';
import { StockCharts } from './StockCharts';

interface OverviewDashboardProps {
  items: PantryItem[];
  profile: UserProfile | null;
  loading: boolean;
  onOpenAddModal: () => void;
  onEditItem: (item: PantryItem) => void;
  onAdjustQuantity: (item: PantryItem, delta: number) => Promise<void>;
  onMarkConsumed: (item: PantryItem) => Promise<void>;
  onLoadSampleData: () => Promise<void>;
  onNavigateToCatalogue: (foodGroup?: FoodGroup) => void;
  onNavigateToNotifications: () => void;
  loadingSample: boolean;
}

export function OverviewDashboard({
  items,
  profile,
  loading,
  onOpenAddModal,
  onEditItem,
  onAdjustQuantity,
  onMarkConsumed,
  onLoadSampleData,
  onNavigateToCatalogue,
  onNavigateToNotifications,
  loadingSample,
}: OverviewDashboardProps) {
  const { t, tGroup, formatNumber } = useI18n();
  const thresholdDays = profile?.alertThresholdDays ?? 30;
  const householdSize = profile?.householdSize ?? 2;

  const activeItems = items.filter((item) => item.status === 'active');
  const totalUnits = activeItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalCalories = activeItems.reduce(
    (sum, item) => sum + item.quantity * item.caloriesPerUnit,
    0,
  );
  const personDays = householdSize > 0 ? Math.round(totalCalories / (householdSize * 2000)) : 0;

  const expiredItems = activeItems.filter((item) => getDaysRemaining(item.expirationDate) < 0);
  const expiringSoonItems = activeItems.filter((item) => {
    const days = getDaysRemaining(item.expirationDate);
    return days >= 0 && days <= thresholdDays;
  });
  const lowStockItems = activeItems.filter(
    (item) => item.targetMinQuantity > 0 && item.quantity < item.targetMinQuantity,
  );

  const urgentQueue = [...expiredItems, ...expiringSoonItems]
    .sort((a, b) => getDaysRemaining(a.expirationDate) - getDaysRemaining(b.expirationDate))
    .slice(0, 8);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className="h-28 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 animate-pulse"
            >
              <div className="h-3 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-7 w-20 bg-slate-200 dark:bg-slate-800 rounded mt-4" />
            </div>
          ))}
        </div>
        <div className="h-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-10 text-center max-w-2xl mx-auto mt-8">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {t('emptyTitle')}
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 max-w-md mx-auto leading-relaxed">
          {t('emptyDesc')}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onOpenAddModal}
            className="px-4 py-2 text-sm font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-md hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors"
          >
            {t('logFirstSupply')}
          </button>
          <button
            type="button"
            onClick={() => void onLoadSampleData()}
            disabled={loadingSample}
            className="px-4 py-2 text-sm font-medium border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            {loadingSample ? t('loadingSample') : t('loadSample')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {t('kpiActiveStock')}
          </div>
          <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {formatNumber(totalUnits)}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {t('kpiBatchesBelow', { batches: activeItems.length, low: lowStockItems.length })}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {t('kpiCalorieReserve')}
          </div>
          <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {formatNumber(Math.round(totalCalories))} kcal
          </div>
          <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {t('kpiDaysForHousehold', {
              days: personDays,
              count: householdSize,
              personLabel: householdSize === 1 ? t('personSingular') : t('personPlural'),
            })}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {t('kpiExpiringWithin', { days: thresholdDays })}
          </div>
          <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-amber-600 dark:text-amber-400">
            {expiringSoonItems.length}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            {expiringSoonItems.length > 0 ? t('kpiQueueRotation') : t('kpiNoUpcoming')}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {t('kpiExpiredSupplies')}
          </div>
          <div
            className={`mt-2 text-2xl font-semibold font-mono tabular-nums ${
              expiredItems.length > 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-emerald-700 dark:text-emerald-400'
            }`}
          >
            {expiredItems.length}
          </div>
          <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            {expiredItems.length > 0 ? t('kpiImmediateInspection') : t('kpiAllWithinDate')}
          </div>
        </div>
      </div>

      {/* Alert Action Strip */}
      {(expiredItems.length > 0 || expiringSoonItems.length > 0) && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
            <Bell className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
            <span>
              {t('alertBanner', {
                count: expiredItems.length + expiringSoonItems.length,
                days: thresholdDays,
              })}
            </span>
          </div>
          <button
            type="button"
            onClick={onNavigateToNotifications}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100 hover:underline whitespace-nowrap shrink-0"
          >
            <span>{t('sendPushOrEmail')}</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Stock Visualization Charts */}
      <StockCharts
        items={items}
        thresholdDays={thresholdDays}
        onSelectFoodGroup={(group) => onNavigateToCatalogue(group)}
      />

      {/* Urgent Rotation Queue */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t('urgentQueueTitle')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t('urgentQueueDesc', { days: thresholdDays })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateToCatalogue()}
            className="text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white inline-flex items-center gap-1 whitespace-nowrap shrink-0"
          >
            <span>{t('viewFullCatalogue')}</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>

        {urgentQueue.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            {t('urgentQueueEmpty', { days: thresholdDays })}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4">{t('colItem')}</th>
                  <th className="py-2.5 px-4">{t('colFoodGroup')}</th>
                  <th className="py-2.5 px-4">{t('colLocation')}</th>
                  <th className="py-2.5 px-4 text-right">{t('colOnHand')}</th>
                  <th className="py-2.5 px-4">{t('colExpires')}</th>
                  <th className="py-2.5 px-4">{t('colStatus')}</th>
                  <th className="py-2.5 px-4 text-right">{t('colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                {urgentQueue.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100">
                      {item.name}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {tGroup(item.foodGroup)}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-600 dark:text-slate-400">
                      {item.storageLocation || t('unassigned')}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs tabular-nums text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {item.quantity} {item.unit}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {item.expirationDate}
                    </td>
                    <td className="py-2.5 px-4">
                      <ExpirationStatusLabel
                        expirationDate={item.expirationDate}
                        thresholdDays={thresholdDays}
                        status={item.status}
                      />
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="inline-flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => void onAdjustQuantity(item, -1)}
                          aria-label={`- ${item.name}`}
                          className="p-1.5 rounded text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void onAdjustQuantity(item, 1)}
                          aria-label={`+ ${item.name}`}
                          className="p-1.5 rounded text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void onMarkConsumed(item)}
                          aria-label={item.name}
                          className="p-1.5 rounded text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                        >
                          {item.status === 'active' ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : (
                            <RotateCcw className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => onEditItem(item)}
                          aria-label={item.name}
                          className="p-1.5 rounded text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
