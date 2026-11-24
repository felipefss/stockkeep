import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  Check,
  Download,
  Edit2,
  Minus,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import { useI18n } from '../i18n';
import { FOOD_GROUPS, type FoodGroup, type PantryItem } from '../types';
import {
  buildCsvExport,
  buildIcsExport,
  downloadTextFile,
  getDaysRemaining,
} from '../utils/inventory';
import { ExpirationStatusLabel } from './StatusLabel';

interface CatalogueViewProps {
  items: PantryItem[];
  thresholdDays: number;
  selectedFoodGroup: FoodGroup | 'ALL';
  onSelectFoodGroup: (group: FoodGroup | 'ALL') => void;
  onOpenAddModal: (defaultGroup?: FoodGroup) => void;
  onEditItem: (item: PantryItem) => void;
  onAdjustQuantity: (item: PantryItem, delta: number) => Promise<void>;
  onToggleStatus: (item: PantryItem) => Promise<void>;
  onDeleteItem: (item: PantryItem) => Promise<void>;
  onDeleteItems: (itemIds: string[]) => Promise<void>;
}

type StatusFilter = 'active' | 'expiring' | 'expired' | 'low_stock' | 'consumed' | 'all';
type SortField = 'expiration' | 'name' | 'quantity' | 'group';

export function CatalogueView({
  items,
  thresholdDays,
  selectedFoodGroup,
  onSelectFoodGroup,
  onOpenAddModal,
  onEditItem,
  onAdjustQuantity,
  onToggleStatus,
  onDeleteItem,
  onDeleteItems,
}: CatalogueViewProps) {
  const { t, tGroup, formatNumber } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [sortField, setSortField] = useState<SortField>('expiration');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [confirmBulkMode, setConfirmBulkMode] = useState<'none' | 'selected' | 'all'>('none');
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return items
      .filter((item) => {
        if (selectedFoodGroup !== 'ALL' && item.foodGroup !== selectedFoodGroup) {
          return false;
        }
        if (q) {
          const haystack = `${item.name} ${item.foodGroup} ${tGroup(item.foodGroup)} ${item.storageLocation} ${item.notes}`.toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        const days = getDaysRemaining(item.expirationDate);
        if (statusFilter === 'active') return item.status === 'active';
        if (statusFilter === 'expired') return item.status === 'active' && days < 0;
        if (statusFilter === 'expiring') {
          return item.status === 'active' && days >= 0 && days <= thresholdDays;
        }
        if (statusFilter === 'low_stock') {
          return (
            item.status === 'active' &&
            item.targetMinQuantity > 0 &&
            item.quantity < item.targetMinQuantity
          );
        }
        if (statusFilter === 'consumed') return item.status !== 'active';
        return true;
      })
      .sort((a, b) => {
        if (sortField === 'expiration') {
          return getDaysRemaining(a.expirationDate) - getDaysRemaining(b.expirationDate);
        }
        if (sortField === 'name') {
          return a.name.localeCompare(b.name);
        }
        if (sortField === 'quantity') {
          return b.quantity - a.quantity;
        }
        return tGroup(a.foodGroup).localeCompare(tGroup(b.foodGroup));
      });
  }, [items, selectedFoodGroup, searchQuery, statusFilter, sortField, thresholdDays, tGroup]);

  // Keep selectedIds pruned to items that still exist
  useEffect(() => {
    const existingIds = new Set(items.map((item) => item.id));
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (existingIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    if (items.length === 0) {
      setConfirmBulkMode('none');
    }
  }, [items]);

  const allFilteredSelected =
    filteredItems.length > 0 && filteredItems.every((item) => selectedIds.has(item.id));
  const someFilteredSelected =
    filteredItems.some((item) => selectedIds.has(item.id)) && !allFilteredSelected;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someFilteredSelected;
    }
  }, [someFilteredSelected]);

  useEffect(() => {
    if (selectedIds.size === 0 && confirmBulkMode === 'selected') {
      setConfirmBulkMode('none');
    }
  }, [selectedIds.size, confirmBulkMode]);

  function toggleSelectAllFiltered() {
    setConfirmBulkMode('none');
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const item of filteredItems) {
          next.delete(item.id);
        }
      } else {
        for (const item of filteredItems) {
          next.add(item.id);
        }
      }
      return next;
    });
  }

  function toggleSelectItem(id: string) {
    setConfirmBulkMode('none');
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function executeDeleteSelected() {
    if (selectedIds.size === 0 || bulkDeleting) return;
    setBulkDeleting(true);
    try {
      await onDeleteItems(Array.from(selectedIds));
      setSelectedIds(new Set());
      setConfirmBulkMode('none');
    } finally {
      setBulkDeleting(false);
    }
  }

  async function executeDeleteAll() {
    if (items.length === 0 || bulkDeleting) return;
    setBulkDeleting(true);
    try {
      await onDeleteItems(items.map((item) => item.id));
      setSelectedIds(new Set());
      setConfirmBulkMode('none');
    } finally {
      setBulkDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              aria-label={t('searchPlaceholder')}
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-200"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label={t('sortExpiration')}
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
              className="px-3 py-2 text-xs font-medium bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-700 dark:text-slate-300"
            >
              <option value="expiration">{t('sortExpiration')}</option>
              <option value="name">{t('sortName')}</option>
              <option value="quantity">{t('sortQuantity')}</option>
              <option value="group">{t('sortGroup')}</option>
            </select>

            <button
              type="button"
              onClick={() =>
                downloadTextFile(
                  `stockkeep-inventory-${new Date().toISOString().slice(0, 10)}.csv`,
                  buildCsvExport(filteredItems),
                  'text/csv;charset=utf-8',
                )
              }
              disabled={filteredItems.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 dark:border-slate-800 rounded-md text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('exportCsv')}</span>
            </button>

            <button
              type="button"
              onClick={() =>
                downloadTextFile(
                  `stockkeep-rotation-${new Date().toISOString().slice(0, 10)}.ics`,
                  buildIcsExport(items),
                  'text/calendar;charset=utf-8',
                )
              }
              disabled={items.filter((i) => i.status === 'active').length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 dark:border-slate-800 rounded-md text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
            >
              <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('exportIcs')}</span>
            </button>

            {items.length > 0 &&
              (confirmBulkMode === 'all' ? (
                <div className="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={bulkDeleting}
                    onClick={() => void executeDeleteAll()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>
                      {bulkDeleting
                        ? t('deleting')
                        : t('confirmDeleteAll', { count: items.length })}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={bulkDeleting}
                    onClick={() => setConfirmBulkMode('none')}
                    className="px-2.5 py-2 text-xs font-medium border border-slate-200 dark:border-slate-800 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    {t('cancel')}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={bulkDeleting}
                  onClick={() => {
                    setConfirmDeleteId(null);
                    setConfirmBulkMode('all');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 dark:border-slate-800 rounded-md text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-200 dark:hover:border-red-900 disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t('deleteAllItems')}</span>
                </button>
              ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-950 rounded-md">
            {(
              [
                { key: 'active', label: t('tabActive') },
                { key: 'expiring', label: t('tabExpiring', { days: thresholdDays }) },
                { key: 'expired', label: t('tabExpired') },
                { key: 'low_stock', label: t('tabLowStock') },
                { key: 'consumed', label: t('tabConsumed') },
                { key: 'all', label: t('tabAll') },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  statusFilter === tab.key
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <select
            aria-label={t('colFoodGroup')}
            value={selectedFoodGroup}
            onChange={(e) => onSelectFoodGroup(e.target.value as FoodGroup | 'ALL')}
            className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md text-slate-700 dark:text-slate-300"
          >
            <option value="ALL">{t('allFoodGroups')}</option>
            {FOOD_GROUPS.map((g) => (
              <option key={g} value={g}>
                {tGroup(g)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        {selectedIds.size > 0 && (
          <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
              {t('selectedCount', { count: selectedIds.size })}
            </span>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={bulkDeleting}
                onClick={() => {
                  setSelectedIds(new Set());
                  if (confirmBulkMode === 'selected') setConfirmBulkMode('none');
                }}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {t('clearSelection')}
              </button>

              {confirmBulkMode === 'selected' ? (
                <>
                  <button
                    type="button"
                    disabled={bulkDeleting}
                    onClick={() => void executeDeleteSelected()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>
                      {bulkDeleting
                        ? t('deleting')
                        : t('confirmDeleteSelected', { count: selectedIds.size })}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={bulkDeleting}
                    onClick={() => setConfirmBulkMode('none')}
                    className="px-2.5 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-md text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    {t('cancel')}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={bulkDeleting}
                  onClick={() => {
                    setConfirmDeleteId(null);
                    setConfirmBulkMode('selected');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-md hover:bg-red-100 dark:hover:bg-red-950/80 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{t('deleteSelected', { count: selectedIds.size })}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {filteredItems.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {t('noMatchingItems')}
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('active');
                  onSelectFoodGroup('ALL');
                }}
                className="px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-md text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {t('resetFilters')}
              </button>
              <button
                type="button"
                onClick={() =>
                  onOpenAddModal(selectedFoodGroup === 'ALL' ? undefined : selectedFoodGroup)
                }
                className="px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-md hover:bg-slate-800 dark:hover:bg-slate-200"
              >
                {t('addSupply')}
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 pl-4 pr-2 w-10">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAllFiltered}
                      aria-label={t('selectAll')}
                      className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 accent-slate-900 dark:accent-slate-100 cursor-pointer align-middle"
                    />
                  </th>
                  <th className="py-2.5 px-4">{t('colSupplyItem')}</th>
                  <th className="py-2.5 px-4">{t('colFoodGroup')}</th>
                  <th className="py-2.5 px-4">{t('colLocation')}</th>
                  <th className="py-2.5 px-4 text-right">{t('colStockTarget')}</th>
                  <th className="py-2.5 px-4 text-right">{t('colCalories')}</th>
                  <th className="py-2.5 px-4">{t('colExpiration')}</th>
                  <th className="py-2.5 px-4">{t('colStatus')}</th>
                  <th className="py-2.5 px-4 text-right">{t('colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                {filteredItems.map((item) => {
                  const isLow =
                    item.status === 'active' &&
                    item.targetMinQuantity > 0 &&
                    item.quantity < item.targetMinQuantity;
                  const totalKcal = Math.round(item.quantity * item.caloriesPerUnit);
                  const isSelected = selectedIds.has(item.id);

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors ${
                        isSelected
                          ? 'bg-slate-50/90 dark:bg-slate-800/50'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-3 pl-4 pr-2 w-10">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectItem(item.id)}
                          aria-label={t('selectItem', { name: item.name })}
                          className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 accent-slate-900 dark:accent-slate-100 cursor-pointer align-middle"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {item.name}
                        </div>
                        {item.notes && (
                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-xs mt-0.5">
                            {item.notes}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {tGroup(item.foodGroup)}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400">
                        {item.storageLocation || t('unassigned')}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs tabular-nums whitespace-nowrap">
                        <span
                          className={
                            isLow
                              ? 'font-semibold text-amber-600 dark:text-amber-400'
                              : 'font-semibold text-slate-900 dark:text-slate-100'
                          }
                        >
                          {item.quantity}
                        </span>
                        <span className="text-slate-400 dark:text-slate-500">
                          {' '}
                          / {item.targetMinQuantity} {item.unit}
                        </span>
                        {isLow && (
                          <div className="text-[11px] font-sans text-amber-600 dark:text-amber-400">
                            {t('belowTarget')}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {totalKcal > 0 ? `${formatNumber(totalKcal)} kcal` : '—'}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {item.expirationDate}
                      </td>
                      <td className="py-3 px-4">
                        <ExpirationStatusLabel
                          expirationDate={item.expirationDate}
                          thresholdDays={thresholdDays}
                          status={item.status}
                        />
                      </td>
                      <td className="py-3 px-4 text-right">
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
                            onClick={() => void onToggleStatus(item)}
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
                          {confirmDeleteId === item.id ? (
                            <button
                              type="button"
                              disabled={bulkDeleting}
                              onClick={() => {
                                setConfirmDeleteId(null);
                                void onDeleteItem(item);
                              }}
                              className="px-2 py-1 text-xs font-semibold text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
                            >
                              {t('confirm')}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={bulkDeleting}
                              onClick={() => setConfirmDeleteId(item.id)}
                              aria-label={item.name}
                              className="p-1.5 rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-40"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
