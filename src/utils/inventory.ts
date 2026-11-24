import {
  BLUEPRINT_LIMITS,
  DATE_PATTERN,
  FOOD_GROUPS,
  type ExpirationBucket,
  type FoodGroup,
  type PantryItem,
  type PantryItemInput,
} from '../types';

export function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDaysToIsoDate(daysOffset: number): string {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysOffset);
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, '0');
  const d = String(target.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getDaysRemaining(expirationDate: string): number {
  if (!DATE_PATTERN.test(expirationDate)) {
    return 0;
  }
  const [y, m, d] = expirationDate.split('-').map(Number);
  const today = new Date();
  const todayMidnight = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const targetMidnight = Date.UTC(y, m - 1, d);
  return Math.round((targetMidnight - todayMidnight) / 86400000);
}

export function getExpirationBucket(
  expirationDate: string,
  thresholdDays = 30,
): ExpirationBucket {
  const days = getDaysRemaining(expirationDate);
  if (days < 0) return 'expired';
  if (days <= Math.min(7, thresholdDays)) return 'critical';
  if (days <= thresholdDays) return 'warning';
  return 'fresh';
}

export function formatDaysLabel(daysRemaining: number): string {
  if (daysRemaining < 0) {
    return `Expired ${Math.abs(daysRemaining)}d ago`;
  }
  if (daysRemaining === 0) {
    return 'Expires today';
  }
  return `${daysRemaining}d left`;
}

export function sanitizePantryInput(raw: PantryItemInput): PantryItemInput {
  const foodGroup = FOOD_GROUPS.includes(raw.foodGroup)
    ? raw.foodGroup
    : 'Ready-to-Eat Meals';
  const name = raw.name.trim().slice(0, BLUEPRINT_LIMITS.NAME_MAX) || 'Unnamed Supply';
  const unit = raw.unit.trim().slice(0, BLUEPRINT_LIMITS.UNIT_MAX) || 'units';
  const storageLocation = raw.storageLocation.trim().slice(0, BLUEPRINT_LIMITS.LOCATION_MAX);
  const notes = raw.notes.trim().slice(0, BLUEPRINT_LIMITS.NOTES_MAX);
  const expirationDate = DATE_PATTERN.test(raw.expirationDate)
    ? raw.expirationDate
    : addDaysToIsoDate(180);

  const quantity = Math.max(
    0,
    Math.min(BLUEPRINT_LIMITS.QUANTITY_MAX, Number.isFinite(raw.quantity) ? Number(raw.quantity) : 0),
  );
  const targetMinQuantity = Math.max(
    0,
    Math.min(
      BLUEPRINT_LIMITS.QUANTITY_MAX,
      Number.isFinite(raw.targetMinQuantity) ? Number(raw.targetMinQuantity) : 0,
    ),
  );
  const caloriesPerUnit = Math.max(
    0,
    Math.min(
      BLUEPRINT_LIMITS.CALORIES_MAX,
      Number.isFinite(raw.caloriesPerUnit) ? Number(raw.caloriesPerUnit) : 0,
    ),
  );

  return {
    name,
    foodGroup,
    quantity,
    targetMinQuantity,
    unit,
    caloriesPerUnit,
    storageLocation,
    expirationDate,
    notes,
    status: raw.status,
  };
}

export function buildCsvExport(items: PantryItem[]): string {
  const headers = [
    'Name',
    'Food Group',
    'Status',
    'Quantity',
    'Target Minimum',
    'Unit',
    'Calories Per Unit',
    'Total Calories',
    'Expiration Date',
    'Days Remaining',
    'Storage Location',
    'Notes',
  ];

  const escapeCell = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = items.map((item) => {
    const days = getDaysRemaining(item.expirationDate);
    return [
      item.name,
      item.foodGroup,
      item.status,
      item.quantity,
      item.targetMinQuantity,
      item.unit,
      item.caloriesPerUnit,
      Math.round(item.quantity * item.caloriesPerUnit),
      item.expirationDate,
      days,
      item.storageLocation,
      item.notes,
    ]
      .map(escapeCell)
      .join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

export function buildIcsExport(items: PantryItem[]): string {
  const activeItems = items.filter((item) => item.status === 'active');
  const nowStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const events = activeItems.map((item) => {
    const dtStart = item.expirationDate.replace(/-/g, '');
    const summary = `Rotate Stock: ${item.name} (${item.quantity} ${item.unit})`;
    const description = `Food Group: ${item.foodGroup}\\nLocation: ${
      item.storageLocation || 'Unassigned'
    }\\nNotes: ${item.notes || 'None'}`;

    return [
      'BEGIN:VEVENT',
      `UID:stockkeep-${item.id}@stockkeep.local`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART;VALUE=DATE:${dtStart}`,
      `SUMMARY:${summary.replace(/\n/g, ' ')}`,
      `DESCRIPTION:${description}`,
      'END:VEVENT',
    ].join('\r\n');
  });

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Stockkeep//Emergency Pantry Rotation//EN',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}

export function buildEmlFile(recipient: string, subject: string, textBody: string): string {
  const dateHeader = new Date().toUTCString();
  return [
    `To: ${recipient}`,
    `Subject: ${subject}`,
    `Date: ${dateHeader}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    textBody,
  ].join('\r\n');
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function getSampleEmergencyPantry(): PantryItemInput[] {
  return [
    {
      name: 'Potable Drinking Water (5L Jerrycan)',
      foodGroup: 'Water & Hydration',
      quantity: 12,
      targetMinQuantity: 15,
      unit: 'jugs',
      caloriesPerUnit: 0,
      storageLocation: 'Basement Rack A1',
      expirationDate: addDaysToIsoDate(195),
      notes: 'Treat or rotate every 6 months.',
      status: 'active',
    },
    {
      name: 'Electrolyte Hydration Packets',
      foodGroup: 'Water & Hydration',
      quantity: 40,
      targetMinQuantity: 30,
      unit: 'packs',
      caloriesPerUnit: 35,
      storageLocation: 'First Aid & Go-Bag Bin',
      expirationDate: addDaysToIsoDate(12),
      notes: 'Consume older box before winter.',
      status: 'active',
    },
    {
      name: 'Vacuum-Sealed White Basmati Rice (2kg)',
      foodGroup: 'Grains & Starches',
      quantity: 8,
      targetMinQuantity: 10,
      unit: 'bags',
      caloriesPerUnit: 7100,
      storageLocation: 'Dry Pantry Tote 1',
      expirationDate: addDaysToIsoDate(540),
      notes: 'Oxygen absorber sealed inside mylar.',
      status: 'active',
    },
    {
      name: 'Rolled Oats Steel-Cut Tin',
      foodGroup: 'Grains & Starches',
      quantity: 4,
      targetMinQuantity: 6,
      unit: 'tins',
      caloriesPerUnit: 3600,
      storageLocation: 'Kitchen Upper Shelf',
      expirationDate: addDaysToIsoDate(22),
      notes: 'Rotate into weekday breakfast.',
      status: 'active',
    },
    {
      name: 'Canned Black Beans (400g)',
      foodGroup: 'Proteins & Legumes',
      quantity: 18,
      targetMinQuantity: 16,
      unit: 'cans',
      caloriesPerUnit: 420,
      storageLocation: 'Basement Rack B2',
      expirationDate: addDaysToIsoDate(310),
      notes: 'Low-sodium cans, pull-tab lids.',
      status: 'active',
    },
    {
      name: 'Wild Pink Salmon Pouches',
      foodGroup: 'Proteins & Legumes',
      quantity: 10,
      targetMinQuantity: 12,
      unit: 'pouches',
      caloriesPerUnit: 190,
      storageLocation: 'Go-Bag Bin',
      expirationDate: addDaysToIsoDate(-5),
      notes: 'Past best-by date; inspect and rotate immediately.',
      status: 'active',
    },
    {
      name: 'Freeze-Dried Berry & Spinach Medley',
      foodGroup: 'Fruits & Vegetables',
      quantity: 6,
      targetMinQuantity: 8,
      unit: 'cans',
      caloriesPerUnit: 950,
      storageLocation: 'Basement Rack C1',
      expirationDate: addDaysToIsoDate(920),
      notes: '#10 emergency storage cans.',
      status: 'active',
    },
    {
      name: 'Canned Diced Tomatoes',
      foodGroup: 'Fruits & Vegetables',
      quantity: 9,
      targetMinQuantity: 12,
      unit: 'cans',
      caloriesPerUnit: 110,
      storageLocation: 'Kitchen Lower Pantry',
      expirationDate: addDaysToIsoDate(6),
      notes: 'Use in meal prep this week.',
      status: 'active',
    },
    {
      name: 'UHT Whole Milk Cartons (1L)',
      foodGroup: 'Dairy & Alternatives',
      quantity: 6,
      targetMinQuantity: 10,
      unit: 'cartons',
      caloriesPerUnit: 620,
      storageLocation: 'Utility Closet Cool Shelf',
      expirationDate: addDaysToIsoDate(17),
      notes: 'Shelf-stable until opened.',
      status: 'active',
    },
    {
      name: 'Extra Virgin Olive Oil (1L Tin)',
      foodGroup: 'Fats, Oils & Condiments',
      quantity: 3,
      targetMinQuantity: 4,
      unit: 'tins',
      caloriesPerUnit: 8200,
      storageLocation: 'Cool Dark Cabinet',
      expirationDate: addDaysToIsoDate(75),
      notes: 'Keep away from heat sources.',
      status: 'active',
    },
    {
      name: 'Natural Peanut Butter Jars (500g)',
      foodGroup: 'Fats, Oils & Condiments',
      quantity: 5,
      targetMinQuantity: 6,
      unit: 'jars',
      caloriesPerUnit: 2950,
      storageLocation: 'Kitchen Pantry',
      expirationDate: addDaysToIsoDate(-2),
      notes: 'Batch from spring rotation.',
      status: 'active',
    },
    {
      name: 'Self-Heating Beef Stew Ration Packs',
      foodGroup: 'Ready-to-Eat Meals',
      quantity: 14,
      targetMinQuantity: 12,
      unit: 'packs',
      caloriesPerUnit: 1250,
      storageLocation: 'Garage Emergency Trunk',
      expirationDate: addDaysToIsoDate(420),
      notes: 'Includes flameless ration heaters.',
      status: 'active',
    },
  ];
}

export interface GroupSummary {
  foodGroup: FoodGroup;
  itemCount: number;
  totalQuantity: number;
  totalTarget: number;
  adequacyPct: number;
  totalCalories: number;
  expiredCount: number;
  expiringSoonCount: number;
  soonestDays: number | null;
}

export function summarizeByFoodGroup(
  items: PantryItem[],
  thresholdDays: number,
): GroupSummary[] {
  const activeItems = items.filter((item) => item.status === 'active');

  return FOOD_GROUPS.map((foodGroup) => {
    const groupItems = activeItems.filter((item) => item.foodGroup === foodGroup);
    const totalQuantity = groupItems.reduce((sum, item) => sum + item.quantity, 0);
    const totalTarget = groupItems.reduce((sum, item) => sum + item.targetMinQuantity, 0);
    const totalCalories = groupItems.reduce(
      (sum, item) => sum + item.quantity * item.caloriesPerUnit,
      0,
    );

    const adequacyPct =
      totalTarget > 0
        ? Math.min(100, Math.round((totalQuantity / totalTarget) * 100))
        : groupItems.length > 0
          ? 100
          : 0;

    let expiredCount = 0;
    let expiringSoonCount = 0;
    let soonestDays: number | null = null;

    for (const item of groupItems) {
      const days = getDaysRemaining(item.expirationDate);
      if (soonestDays === null || days < soonestDays) {
        soonestDays = days;
      }
      if (days < 0) {
        expiredCount += 1;
      } else if (days <= thresholdDays) {
        expiringSoonCount += 1;
      }
    }

    return {
      foodGroup,
      itemCount: groupItems.length,
      totalQuantity,
      totalTarget,
      adequacyPct,
      totalCalories,
      expiredCount,
      expiringSoonCount,
      soonestDays,
    };
  });
}
