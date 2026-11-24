import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../i18n';
import {
  BLUEPRINT_LIMITS,
  FOOD_GROUPS,
  type FoodGroup,
  type ItemStatus,
  type PantryItem,
  type PantryItemInput,
} from '../types';
import { addDaysToIsoDate, sanitizePantryInput } from '../utils/inventory';

interface SupplyModalProps {
  isOpen: boolean;
  editingItem: PantryItem | null;
  defaultFoodGroup?: FoodGroup;
  onClose: () => void;
  onSave: (input: PantryItemInput, existingId?: string) => Promise<void>;
}

const COMMON_UNITS = ['cans', 'pouches', 'bags', 'kg', 'L', 'jugs', 'jars', 'packs', 'tins', 'cartons'];

export function SupplyModal({
  isOpen,
  editingItem,
  defaultFoodGroup,
  onClose,
  onSave,
}: SupplyModalProps) {
  const { t, tGroup } = useI18n();
  const [name, setName] = useState('');
  const [foodGroup, setFoodGroup] = useState<FoodGroup>('Grains & Starches');
  const [quantity, setQuantity] = useState('1');
  const [targetMinQuantity, setTargetMinQuantity] = useState('4');
  const [unit, setUnit] = useState('cans');
  const [caloriesPerUnit, setCaloriesPerUnit] = useState('400');
  const [storageLocation, setStorageLocation] = useState('');
  const [expirationDate, setExpirationDate] = useState(addDaysToIsoDate(180));
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<ItemStatus>('active');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    if (editingItem) {
      setName(editingItem.name);
      setFoodGroup(editingItem.foodGroup);
      setQuantity(String(editingItem.quantity));
      setTargetMinQuantity(String(editingItem.targetMinQuantity));
      setUnit(editingItem.unit);
      setCaloriesPerUnit(String(editingItem.caloriesPerUnit));
      setStorageLocation(editingItem.storageLocation);
      setExpirationDate(editingItem.expirationDate);
      setNotes(editingItem.notes);
      setStatus(editingItem.status);
    } else {
      setName('');
      setFoodGroup(defaultFoodGroup || 'Grains & Starches');
      setQuantity('4');
      setTargetMinQuantity('6');
      setUnit('cans');
      setCaloriesPerUnit('400');
      setStorageLocation('');
      setExpirationDate(addDaysToIsoDate(180));
      setNotes('');
      setStatus('active');
    }
  }, [isOpen, editingItem, defaultFoodGroup]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim()) {
      setErrorMsg(t('errNameRequired'));
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(expirationDate)) {
      setErrorMsg(t('errDateFormat'));
      return;
    }

    const sanitized = sanitizePantryInput({
      name,
      foodGroup,
      quantity: Number(quantity),
      targetMinQuantity: Number(targetMinQuantity),
      unit,
      caloriesPerUnit: Number(caloriesPerUnit),
      storageLocation,
      expirationDate,
      notes,
      status,
    });

    setSaving(true);
    try {
      await onSave(sanitized, editingItem?.id);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to save supply item.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="supply-modal-title"
    >
      <div className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2
            id="supply-modal-title"
            className="text-base font-semibold text-slate-900 dark:text-slate-100"
          >
            {editingItem ? t('modalEditTitle') : t('modalAddTitle')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('cancel')}
            className="p-2 rounded-md text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 text-xs font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-md">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label
                htmlFor="supply-name"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t('fieldItemName')}
              </label>
              <input
                id="supply-name"
                type="text"
                required
                maxLength={BLUEPRINT_LIMITS.NAME_MAX}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('fieldItemPlaceholder')}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-200"
              />
            </div>

            <div>
              <label
                htmlFor="supply-group"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t('fieldFoodGroup')}
              </label>
              <select
                id="supply-group"
                value={foodGroup}
                onChange={(e) => setFoodGroup(e.target.value as FoodGroup)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-200"
              >
                {FOOD_GROUPS.map((g) => (
                  <option key={g} value={g}>
                    {tGroup(g)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="supply-expiration"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t('fieldExpirationDate')}
              </label>
              <input
                id="supply-expiration"
                type="date"
                required
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-200"
              />
            </div>

            <div>
              <label
                htmlFor="supply-qty"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t('fieldQuantity')}
              </label>
              <input
                id="supply-qty"
                type="number"
                min={0}
                max={BLUEPRINT_LIMITS.QUANTITY_MAX}
                step="any"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-200"
              />
            </div>

            <div>
              <label
                htmlFor="supply-target"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t('fieldTargetMin')}
              </label>
              <input
                id="supply-target"
                type="number"
                min={0}
                max={BLUEPRINT_LIMITS.QUANTITY_MAX}
                step="any"
                required
                value={targetMinQuantity}
                onChange={(e) => setTargetMinQuantity(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-200"
              />
            </div>

            <div>
              <label
                htmlFor="supply-unit"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t('fieldUnit')}
              </label>
              <input
                id="supply-unit"
                type="text"
                list="common-units"
                required
                maxLength={BLUEPRINT_LIMITS.UNIT_MAX}
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder={t('fieldUnitPlaceholder')}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-200"
              />
              <datalist id="common-units">
                {COMMON_UNITS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>

            <div>
              <label
                htmlFor="supply-kcal"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t('fieldCaloriesPerUnit')}
              </label>
              <input
                id="supply-kcal"
                type="number"
                min={0}
                max={BLUEPRINT_LIMITS.CALORIES_MAX}
                step="1"
                value={caloriesPerUnit}
                onChange={(e) => setCaloriesPerUnit(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-200"
              />
            </div>

            <div>
              <label
                htmlFor="supply-location"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t('fieldLocation')}
              </label>
              <input
                id="supply-location"
                type="text"
                maxLength={BLUEPRINT_LIMITS.LOCATION_MAX}
                value={storageLocation}
                onChange={(e) => setStorageLocation(e.target.value)}
                placeholder={t('fieldLocationPlaceholder')}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-200"
              />
            </div>

            <div>
              <label
                htmlFor="supply-status"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t('fieldBatchStatus')}
              </label>
              <select
                id="supply-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as ItemStatus)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-200"
              >
                <option value="active">{t('statusActiveOpt')}</option>
                <option value="consumed">{t('statusConsumedOpt')}</option>
                <option value="discarded">{t('statusDiscardedOpt')}</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="supply-notes"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t('fieldNotes')}
              </label>
              <textarea
                id="supply-notes"
                rows={2}
                maxLength={BLUEPRINT_LIMITS.NOTES_MAX}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('fieldNotesPlaceholder')}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-200"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 rounded-md hover:bg-slate-800 dark:hover:bg-slate-200 disabled:opacity-50 transition-colors"
            >
              {saving ? t('saving') : editingItem ? t('saveChanges') : t('addSupply')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
