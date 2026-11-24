import { useI18n } from '../i18n';
import type { FoodGroup, PantryItem } from '../types';
import { getDaysRemaining, summarizeByFoodGroup } from '../utils/inventory';

interface StockChartsProps {
  items: PantryItem[];
  thresholdDays: number;
  onSelectFoodGroup: (group: FoodGroup) => void;
}

export function StockCharts({
  items,
  thresholdDays,
  onSelectFoodGroup,
}: StockChartsProps) {
  const { t, tGroup, formatNumber } = useI18n();
  const activeItems = items.filter((i) => i.status === 'active');
  const groupSummaries = summarizeByFoodGroup(items, thresholdDays);

  const buckets = [
    {
      key: 'expired',
      label: t('bucketExpired'),
      count: activeItems.filter((i) => getDaysRemaining(i.expirationDate) < 0).length,
      units: activeItems
        .filter((i) => getDaysRemaining(i.expirationDate) < 0)
        .reduce((s, i) => s + i.quantity, 0),
      colorClass: 'fill-red-600 dark:fill-red-500',
      textClass: 'text-red-600 dark:text-red-400',
    },
    {
      key: '7d',
      label: t('bucket7d'),
      count: activeItems.filter((i) => {
        const d = getDaysRemaining(i.expirationDate);
        return d >= 0 && d <= 7;
      }).length,
      units: activeItems
        .filter((i) => {
          const d = getDaysRemaining(i.expirationDate);
          return d >= 0 && d <= 7;
        })
        .reduce((s, i) => s + i.quantity, 0),
      colorClass: 'fill-red-500 dark:fill-red-400',
      textClass: 'text-red-600 dark:text-red-400',
    },
    {
      key: '30d',
      label: t('bucket30d'),
      count: activeItems.filter((i) => {
        const d = getDaysRemaining(i.expirationDate);
        return d > 7 && d <= 30;
      }).length,
      units: activeItems
        .filter((i) => {
          const d = getDaysRemaining(i.expirationDate);
          return d > 7 && d <= 30;
        })
        .reduce((s, i) => s + i.quantity, 0),
      colorClass: 'fill-amber-500 dark:fill-amber-400',
      textClass: 'text-amber-600 dark:text-amber-400',
    },
    {
      key: '90d',
      label: t('bucket90d'),
      count: activeItems.filter((i) => {
        const d = getDaysRemaining(i.expirationDate);
        return d > 30 && d <= 90;
      }).length,
      units: activeItems
        .filter((i) => {
          const d = getDaysRemaining(i.expirationDate);
          return d > 30 && d <= 90;
        })
        .reduce((s, i) => s + i.quantity, 0),
      colorClass: 'fill-slate-600 dark:fill-slate-400',
      textClass: 'text-slate-700 dark:text-slate-300',
    },
    {
      key: 'long',
      label: t('bucketLong'),
      count: activeItems.filter((i) => getDaysRemaining(i.expirationDate) > 90).length,
      units: activeItems
        .filter((i) => getDaysRemaining(i.expirationDate) > 90)
        .reduce((s, i) => s + i.quantity, 0),
      colorClass: 'fill-emerald-600 dark:fill-emerald-500',
      textClass: 'text-emerald-700 dark:text-emerald-400',
    },
  ];

  const maxBucketCount = Math.max(1, ...buckets.map((b) => b.count));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Stock Levels by Food Group */}
      <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6">
        <div className="flex items-baseline justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t('chartAdequacyTitle')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t('chartAdequacyDesc')}
            </p>
          </div>
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
            {t('chartActiveBatches', { count: activeItems.length })}
          </span>
        </div>

        <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800/70">
          {groupSummaries.map((group) => {
            const barColor =
              group.itemCount === 0
                ? 'bg-slate-300 dark:bg-slate-700'
                : group.adequacyPct >= 100
                  ? 'bg-emerald-600 dark:bg-emerald-500'
                  : group.adequacyPct >= 65
                    ? 'bg-amber-500 dark:bg-amber-400'
                    : 'bg-red-600 dark:bg-red-500';

            return (
              <button
                key={group.foodGroup}
                type="button"
                onClick={() => onSelectFoodGroup(group.foodGroup)}
                className="w-full py-3 text-left group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors rounded px-2 -mx-2"
              >
                <div className="flex items-center justify-between gap-3 text-xs mb-1.5">
                  <span className="font-medium text-slate-800 dark:text-slate-200 group-hover:text-slate-950 dark:group-hover:text-white truncate">
                    {tGroup(group.foodGroup)}
                  </span>
                  <div className="flex items-center gap-3 shrink-0 font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    <span>
                      {t('chartUnitsOf', {
                        qty: group.totalQuantity,
                        target: group.totalTarget || '—',
                      })}
                    </span>
                    <span className="w-10 text-right font-semibold text-slate-900 dark:text-slate-100">
                      {group.adequacyPct}%
                    </span>
                  </div>
                </div>
                <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-sm overflow-hidden">
                  <div
                    className={`h-full ${barColor} transition-all duration-200`}
                    style={{ width: `${group.adequacyPct}%` }}
                  />
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  <span>{t('chartItemCount', { count: group.itemCount })}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatNumber(Math.round(group.totalCalories))} kcal</span>
                  {group.expiredCount > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-red-600 dark:text-red-400 font-medium">
                        {t('chartExpiredCount', { count: group.expiredCount })}
                      </span>
                    </>
                  )}
                  {group.expiringSoonCount > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-amber-600 dark:text-amber-400 font-medium">
                        {t('chartExpiringSoonCount', { count: group.expiringSoonCount })}
                      </span>
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Expiration Horizon Distribution */}
      <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 flex flex-col">
        <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t('chartHorizonTitle')}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('chartHorizonDesc')}
          </p>
        </div>

        <div className="flex-1 flex flex-col justify-between pt-5">
          <div className="w-full">
            <svg
              viewBox="0 0 360 170"
              className="w-full h-44 overflow-visible"
              role="img"
              aria-label={t('chartHorizonTitle')}
            >
              <line
                x1="0"
                y1="132"
                x2="360"
                y2="132"
                className="stroke-slate-200 dark:stroke-slate-800"
                strokeWidth="1"
              />
              <line
                x1="0"
                y1="72"
                x2="360"
                y2="72"
                className="stroke-slate-100 dark:stroke-slate-800/70"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              <line
                x1="0"
                y1="16"
                x2="360"
                y2="16"
                className="stroke-slate-100 dark:stroke-slate-800/70"
                strokeDasharray="3 3"
                strokeWidth="1"
              />

              {buckets.map((bucket, idx) => {
                const barWidth = 42;
                const gap = 26;
                const x = 18 + idx * (barWidth + gap);
                const maxBarHeight = 110;
                const height =
                  bucket.count === 0
                    ? 2
                    : Math.max(8, Math.round((bucket.count / maxBucketCount) * maxBarHeight));
                const y = 132 - height;

                return (
                  <g key={bucket.key}>
                    <rect
                      x={x}
                      y={y}
                      width={barWidth}
                      height={height}
                      rx="3"
                      className={
                        bucket.count === 0
                          ? 'fill-slate-200 dark:fill-slate-800'
                          : bucket.colorClass
                      }
                    />
                    <text
                      x={x + barWidth / 2}
                      y={y - 6}
                      textAnchor="middle"
                      className="text-[11px] font-mono font-semibold fill-slate-700 dark:fill-slate-200"
                    >
                      {bucket.count}
                    </text>
                    <text
                      x={x + barWidth / 2}
                      y={152}
                      textAnchor="middle"
                      className="text-[10px] fill-slate-500 dark:fill-slate-400"
                    >
                      {bucket.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
            {buckets.map((bucket) => (
              <div
                key={bucket.key}
                className="flex items-center justify-between text-xs tabular-nums"
              >
                <span className={`font-medium ${bucket.textClass}`}>{bucket.label}</span>
                <span className="font-mono text-slate-600 dark:text-slate-400">
                  {t('bucketSummary', { count: bucket.count, units: bucket.units })}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
