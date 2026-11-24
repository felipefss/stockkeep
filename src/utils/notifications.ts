import type { Locale } from '../i18n';
import type { DeliveryStatus, FoodGroup, PantryItem } from '../types';
import { getDaysRemaining } from './inventory';

export type PushPermissionState = NotificationPermission | 'unsupported';

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getPushPermission(): PushPermissionState {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestPushPermission(): Promise<PushPermissionState> {
  if (!isPushSupported()) return 'unsupported';
  const result = await Notification.requestPermission();
  return result;
}

export function sendBrowserPushNotification(
  title: string,
  body: string,
  tag = 'stockkeep-expiration-alert',
): boolean {
  if (!isPushSupported() || Notification.permission !== 'granted') {
    return false;
  }
  try {
    const notification = new Notification(title, {
      body,
      tag,
      requireInteraction: false,
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    return true;
  } catch {
    return false;
  }
}

export interface EmailDispatchResponse {
  deliveryStatus: DeliveryStatus;
  provider: string;
  message?: string;
  error?: string;
  htmlPreview?: string;
  textPreview?: string;
}

export async function dispatchEmailDigest(params: {
  recipient: string;
  subject: string;
  householdName: string;
  thresholdDays: number;
  locale: Locale;
  translateGroup: (group: FoodGroup) => string;
  items: PantryItem[];
}): Promise<EmailDispatchResponse> {
  const payloadItems = params.items.map((item) => ({
    name: item.name,
    foodGroup: item.foodGroup,
    foodGroupLabel: params.translateGroup(item.foodGroup),
    quantity: item.quantity,
    unit: item.unit,
    expirationDate: item.expirationDate,
    daysRemaining: getDaysRemaining(item.expirationDate),
    storageLocation: item.storageLocation,
  }));

  const response = await fetch('/api/notifications/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: params.recipient,
      subject: params.subject,
      householdName: params.householdName,
      thresholdDays: params.thresholdDays,
      locale: params.locale,
      items: payloadItems,
    }),
  });

  const data = (await response.json()) as EmailDispatchResponse;
  if (!response.ok && !data.deliveryStatus) {
    throw new Error(data.error || 'Failed to dispatch email notification.');
  }
  return data;
}

export async function dispatchWebhookAlert(params: {
  webhookUrl: string;
  subject: string;
  summary: string;
  locale: Locale;
  translateGroup: (group: FoodGroup) => string;
  items: PantryItem[];
}): Promise<{ deliveryStatus: DeliveryStatus; message?: string; error?: string }> {
  const payloadItems = params.items.map((item) => ({
    name: item.name,
    foodGroup: item.foodGroup,
    foodGroupLabel: params.translateGroup(item.foodGroup),
    quantity: item.quantity,
    unit: item.unit,
    expirationDate: item.expirationDate,
    daysRemaining: getDaysRemaining(item.expirationDate),
    storageLocation: item.storageLocation,
  }));

  const response = await fetch('/api/notifications/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      webhookUrl: params.webhookUrl,
      subject: params.subject,
      summary: params.summary,
      locale: params.locale,
      items: payloadItems,
    }),
  });

  const data = (await response.json()) as {
    deliveryStatus: DeliveryStatus;
    message?: string;
    error?: string;
  };
  if (!response.ok && !data.deliveryStatus) {
    throw new Error(data.error || 'Webhook request failed.');
  }
  return data;
}

export async function fetchServerHealth(): Promise<{
  ok: boolean;
  emailProvider: 'resend' | 'smtp' | 'none';
  cronConfigured?: boolean;
  firebaseAdminConfigured?: boolean;
}> {
  const response = await fetch('/api/health');
  if (!response.ok) {
    return {
      ok: false,
      emailProvider: 'none',
      cronConfigured: false,
      firebaseAdminConfigured: false,
    };
  }
  return (await response.json()) as {
    ok: boolean;
    emailProvider: 'resend' | 'smtp' | 'none';
    cronConfigured?: boolean;
    firebaseAdminConfigured?: boolean;
  };
}
