import type { Timestamp } from 'firebase/firestore';

export const FOOD_GROUPS = [
  'Water & Hydration',
  'Grains & Starches',
  'Proteins & Legumes',
  'Fruits & Vegetables',
  'Dairy & Alternatives',
  'Fats, Oils & Condiments',
  'Ready-to-Eat Meals',
] as const;

export type FoodGroup = (typeof FOOD_GROUPS)[number];

export type ItemStatus = 'active' | 'consumed' | 'discarded';
export type DigestFrequency = 'immediate' | 'daily' | 'weekly';
export type NotificationChannel = 'push' | 'email' | 'webhook';
export type DeliveryStatus = 'delivered' | 'logged_unconfigured' | 'failed';

export type ExpirationBucket = 'expired' | 'critical' | 'warning' | 'fresh';

export interface PantryItem {
  id: string;
  userId: string;
  name: string;
  foodGroup: FoodGroup;
  quantity: number;
  targetMinQuantity: number;
  unit: string;
  caloriesPerUnit: number;
  storageLocation: string;
  expirationDate: string; // YYYY-MM-DD
  notes: string;
  status: ItemStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PantryItemInput {
  name: string;
  foodGroup: FoodGroup;
  quantity: number;
  targetMinQuantity: number;
  unit: string;
  caloriesPerUnit: number;
  storageLocation: string;
  expirationDate: string;
  notes: string;
  status: ItemStatus;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  emailNotificationsEnabled: boolean;
  pushNotificationsEnabled: boolean;
  alertThresholdDays: number;
  digestFrequency: DigestFrequency;
  webhookUrl?: string;
  householdSize: number;
  preferredLocale?: 'en' | 'pt-BR' | 'es' | 'fr' | 'de';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface NotificationLog {
  id: string;
  userId: string;
  channel: NotificationChannel;
  recipient: string;
  subject: string;
  itemCount: number;
  deliveryStatus: DeliveryStatus;
  summary: string;
  createdAt: Timestamp;
}

export const BLUEPRINT_LIMITS = {
  NAME_MAX: 120,
  UNIT_MAX: 24,
  LOCATION_MAX: 80,
  NOTES_MAX: 300,
  EMAIL_MAX: 160,
  DISPLAY_NAME_MAX: 100,
  WEBHOOK_MAX: 300,
  SUBJECT_MAX: 160,
  SUMMARY_MAX: 500,
  QUANTITY_MAX: 100000,
  CALORIES_MAX: 50000,
  THRESHOLD_MIN: 1,
  THRESHOLD_MAX: 365,
  HOUSEHOLD_MIN: 1,
  HOUSEHOLD_MAX: 50,
} as const;

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
