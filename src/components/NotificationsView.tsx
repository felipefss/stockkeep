import React, { useEffect, useState } from 'react';
import { Bell, Download, ExternalLink, Mail, Send, Webhook } from 'lucide-react';
import { useI18n } from '../i18n';
import {
  BLUEPRINT_LIMITS,
  type DeliveryStatus,
  type DigestFrequency,
  type NotificationChannel,
  type NotificationLog,
  type PantryItem,
  type UserProfile,
} from '../types';
import { buildEmlFile, downloadTextFile, getDaysRemaining } from '../utils/inventory';
import {
  dispatchEmailDigest,
  dispatchWebhookAlert,
  fetchServerHealth,
  getPushPermission,
  requestPushPermission,
  sendBrowserPushNotification,
  type PushPermissionState,
} from '../utils/notifications';

interface NotificationsViewProps {
  profile: UserProfile | null;
  items: PantryItem[];
  logs: NotificationLog[];
  onSavePreferences: (updates: {
    email: string;
    displayName: string;
    emailNotificationsEnabled: boolean;
    pushNotificationsEnabled: boolean;
    alertThresholdDays: number;
    digestFrequency: DigestFrequency;
    webhookUrl: string;
    householdSize: number;
  }) => Promise<void>;
  onRecordNotificationLog: (entry: {
    channel: NotificationChannel;
    recipient: string;
    subject: string;
    itemCount: number;
    deliveryStatus: DeliveryStatus;
    summary: string;
  }) => Promise<void>;
}

export function NotificationsView({
  profile,
  items,
  logs,
  onSavePreferences,
  onRecordNotificationLog,
}: NotificationsViewProps) {
  const { locale, t, tGroup } = useI18n();
  const [email, setEmail] = useState(profile?.email || '');
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [emailEnabled, setEmailEnabled] = useState(profile?.emailNotificationsEnabled ?? true);
  const [pushEnabled, setPushEnabled] = useState(profile?.pushNotificationsEnabled ?? true);
  const [thresholdDays, setThresholdDays] = useState(String(profile?.alertThresholdDays ?? 30));
  const [digestFrequency, setDigestFrequency] = useState<DigestFrequency>(
    profile?.digestFrequency || 'daily',
  );
  const [webhookUrl, setWebhookUrl] = useState(profile?.webhookUrl || '');
  const [householdSize, setHouseholdSize] = useState(String(profile?.householdSize ?? 2));

  const [pushPermission, setPushPermission] = useState<PushPermissionState>(getPushPermission());
  const [serverEmailProvider, setServerEmailProvider] = useState<'resend' | 'smtp' | 'none'>('none');

  const [savingPrefs, setSavingPrefs] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendingWebhook, setSendingWebhook] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);
  const [errorFeedback, setErrorFeedback] = useState<string | null>(null);
  const [lastEmailPreview, setLastEmailPreview] = useState<{
    subject: string;
    recipient: string;
    html: string;
    text: string;
  } | null>(null);

  useEffect(() => {
    if (profile) {
      setEmail(profile.email);
      setDisplayName(profile.displayName);
      setEmailEnabled(profile.emailNotificationsEnabled);
      setPushEnabled(profile.pushNotificationsEnabled);
      setThresholdDays(String(profile.alertThresholdDays));
      setDigestFrequency(profile.digestFrequency);
      setWebhookUrl(profile.webhookUrl || '');
      setHouseholdSize(String(profile.householdSize));
    }
  }, [profile]);

  useEffect(() => {
    fetchServerHealth()
      .then((res) => setServerEmailProvider(res.emailProvider))
      .catch(() => setServerEmailProvider('none'));
  }, []);

  const numericThreshold = Math.max(
    BLUEPRINT_LIMITS.THRESHOLD_MIN,
    Math.min(BLUEPRINT_LIMITS.THRESHOLD_MAX, Number(thresholdDays) || 30),
  );

  const alertItems = items
    .filter((item) => item.status === 'active')
    .filter((item) => getDaysRemaining(item.expirationDate) <= numericThreshold)
    .sort((a, b) => getDaysRemaining(a.expirationDate) - getDaysRemaining(b.expirationDate));

  function formatItemCountdown(expirationDate: string): string {
    const days = getDaysRemaining(expirationDate);
    if (days < 0) return t('statusExpiredAgo', { days: Math.abs(days) });
    if (days === 0) return t('statusExpiresToday');
    return t('statusDaysLeft', { days });
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setStatusFeedback(null);
    setErrorFeedback(null);
    setSavingPrefs(true);

    try {
      await onSavePreferences({
        email: email.trim().slice(0, BLUEPRINT_LIMITS.EMAIL_MAX),
        displayName:
          displayName.trim().slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX) || t('defaultPantryName'),
        emailNotificationsEnabled: emailEnabled,
        pushNotificationsEnabled: pushEnabled,
        alertThresholdDays: numericThreshold,
        digestFrequency,
        webhookUrl: webhookUrl.trim().slice(0, BLUEPRINT_LIMITS.WEBHOOK_MAX),
        householdSize: Math.max(
          BLUEPRINT_LIMITS.HOUSEHOLD_MIN,
          Math.min(BLUEPRINT_LIMITS.HOUSEHOLD_MAX, Number(householdSize) || 1),
        ),
      });
      setStatusFeedback(t('prefsSaved'));
    } catch (err) {
      setErrorFeedback(err instanceof Error ? err.message : t('outcomeFailed'));
    } finally {
      setSavingPrefs(false);
    }
  }

  async function handleEnablePush() {
    setStatusFeedback(null);
    setErrorFeedback(null);
    const result = await requestPushPermission();
    setPushPermission(result);
    if (result === 'granted') {
      sendBrowserPushNotification(
        t('pushTitle'),
        t('pushDesc', { count: alertItems.length, days: numericThreshold }),
      );
      setStatusFeedback(t('pushEnabledMsg'));
    } else if (result === 'denied') {
      setErrorFeedback(t('pushBlockedMsg'));
    }
  }

  async function handleSendPushAlert(isTest: boolean) {
    setStatusFeedback(null);
    setErrorFeedback(null);
    if (pushPermission !== 'granted') {
      setErrorFeedback(t('pushBlockedMsg'));
      return;
    }

    const title = isTest
      ? t('pushTestTitle')
      : t('pushSessionTitle', { count: alertItems.length });
    const body = isTest
      ? t('pushTestBody', { count: alertItems.length, days: numericThreshold })
      : alertItems.length > 0
        ? alertItems
            .slice(0, 3)
            .map((i) => `${i.name} (${formatItemCountdown(i.expirationDate)})`)
            .join(' · ')
        : t('urgentQueueEmpty', { days: numericThreshold });

    const sent = sendBrowserPushNotification(title, body);
    await onRecordNotificationLog({
      channel: 'push',
      recipient: 'Browser Notification API',
      subject: title,
      itemCount: alertItems.length,
      deliveryStatus: sent ? 'delivered' : 'failed',
      summary: body,
    });

    if (sent) {
      setStatusFeedback(t('pushDispatchedMsg'));
    } else {
      setErrorFeedback(t('pushBrowserBlockedMsg'));
    }
  }

  async function handleSendEmailDigest() {
    setStatusFeedback(null);
    setErrorFeedback(null);
    if (!email.trim() || alertItems.length === 0) return;

    const subject = t('emailSubjectAlert', {
      count: alertItems.length,
      days: numericThreshold,
    });
    setSendingEmail(true);
    try {
      const result = await dispatchEmailDigest({
        recipient: email.trim(),
        subject,
        householdName: displayName.trim() || t('defaultPantryName'),
        thresholdDays: numericThreshold,
        locale,
        translateGroup: tGroup,
        items: alertItems,
      });

      if (result.htmlPreview && result.textPreview) {
        setLastEmailPreview({
          subject,
          recipient: email.trim(),
          html: result.htmlPreview,
          text: result.textPreview,
        });
      }

      const summary = alertItems
        .slice(0, 4)
        .map((i) => `${i.name} (${formatItemCountdown(i.expirationDate)})`)
        .join(', ');

      await onRecordNotificationLog({
        channel: 'email',
        recipient: email.trim(),
        subject,
        itemCount: alertItems.length,
        deliveryStatus: result.deliveryStatus,
        summary,
      });

      if (result.deliveryStatus === 'delivered') {
        setStatusFeedback(t('emailDeliveredMsg', { email: email.trim() }));
      } else if (result.deliveryStatus === 'logged_unconfigured') {
        setStatusFeedback(t('emailPreparedMsg'));
      } else {
        setErrorFeedback(result.error || t('outcomeFailed'));
      }
    } catch (err) {
      setErrorFeedback(err instanceof Error ? err.message : t('outcomeFailed'));
    } finally {
      setSendingEmail(false);
    }
  }

  async function handleSendWebhook() {
    setStatusFeedback(null);
    setErrorFeedback(null);
    if (!webhookUrl.trim()) return;

    const subject = t('webhookSubjectAlert', { count: alertItems.length });
    const summary =
      alertItems.length > 0
        ? alertItems
            .slice(0, 5)
            .map(
              (i) =>
                `${i.name} [${tGroup(i.foodGroup)}]: ${i.quantity} ${i.unit} (${formatItemCountdown(
                  i.expirationDate,
                )})`,
            )
            .join('; ')
        : t('kpiAllWithinDate');

    setSendingWebhook(true);
    try {
      const res = await dispatchWebhookAlert({
        webhookUrl: webhookUrl.trim(),
        subject,
        summary,
        locale,
        translateGroup: tGroup,
        items: alertItems,
      });

      await onRecordNotificationLog({
        channel: 'webhook',
        recipient: webhookUrl.trim().slice(0, 160),
        subject,
        itemCount: alertItems.length,
        deliveryStatus: res.deliveryStatus,
        summary,
      });

      if (res.deliveryStatus === 'delivered') {
        setStatusFeedback(t('webhookDelivered'));
      } else {
        setErrorFeedback(res.error || t('outcomeFailed'));
      }
    } catch (err) {
      setErrorFeedback(err instanceof Error ? err.message : t('outcomeFailed'));
    } finally {
      setSendingWebhook(false);
    }
  }

  return (
    <div className="space-y-6">
      {statusFeedback && (
        <div className="p-3.5 text-xs font-medium text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-md">
          {statusFeedback}
        </div>
      )}
      {errorFeedback && (
        <div className="p-3.5 text-xs font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-md">
          {errorFeedback}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={handleSaveSettings}
          className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-5"
        >
          <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t('notifRulesTitle')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t('notifRulesDesc')}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label
                htmlFor="notif-email"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t('notifEmailLabel')}
              </label>
              <input
                id="notif-email"
                type="email"
                required
                maxLength={BLUEPRINT_LIMITS.EMAIL_MAX}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="notif-household-name"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t('notifHouseholdNameLabel')}
              </label>
              <input
                id="notif-household-name"
                type="text"
                required
                maxLength={BLUEPRINT_LIMITS.DISPLAY_NAME_MAX}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="notif-household-size"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t('notifHouseholdSizeLabel')}
              </label>
              <input
                id="notif-household-size"
                type="number"
                min={BLUEPRINT_LIMITS.HOUSEHOLD_MIN}
                max={BLUEPRINT_LIMITS.HOUSEHOLD_MAX}
                value={householdSize}
                onChange={(e) => setHouseholdSize(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="notif-threshold"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t('notifThresholdLabel')}
              </label>
              <input
                id="notif-threshold"
                type="number"
                min={BLUEPRINT_LIMITS.THRESHOLD_MIN}
                max={BLUEPRINT_LIMITS.THRESHOLD_MAX}
                value={thresholdDays}
                onChange={(e) => setThresholdDays(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
              />
            </div>

            <div>
              <label
                htmlFor="notif-cadence"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t('notifCadenceLabel')}
              </label>
              <select
                id="notif-cadence"
                value={digestFrequency}
                onChange={(e) => setDigestFrequency(e.target.value as DigestFrequency)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
              >
                <option value="immediate">{t('cadenceImmediate')}</option>
                <option value="daily">{t('cadenceDaily')}</option>
                <option value="weekly">{t('cadenceWeekly')}</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="notif-webhook"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {t('notifWebhookLabel')}
              </label>
              <input
                id="notif-webhook"
                type="url"
                maxLength={BLUEPRINT_LIMITS.WEBHOOK_MAX}
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder={t('notifWebhookPlaceholder')}
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="flex items-center justify-between gap-3 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
              <span>{t('notifAutoPushToggle')}</span>
              <input
                type="checkbox"
                checked={pushEnabled}
                onChange={(e) => setPushEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
              <span>{t('notifEmailToggle')}</span>
              <input
                type="checkbox"
                checked={emailEnabled}
                onChange={(e) => setEmailEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
            </label>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={savingPrefs}
              className="px-4 py-2 text-sm font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-md hover:bg-slate-800 dark:hover:bg-slate-200 disabled:opacity-50 transition-colors"
            >
              {savingPrefs ? t('saving') : t('savePreferences')}
            </button>
          </div>
        </form>

        <div className="lg:col-span-6 space-y-5">
          {/* Browser Push Card */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-slate-700 dark:text-slate-300" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t('pushTitle')}
                </h3>
              </div>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                {t('pushPermission', { state: pushPermission })}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {t('pushDesc', { count: alertItems.length, days: numericThreshold })}
            </p>
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              {pushPermission !== 'granted' && pushPermission !== 'unsupported' && (
                <button
                  type="button"
                  onClick={() => void handleEnablePush()}
                  className="px-3.5 py-2 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-md hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors"
                >
                  {t('enableBrowserPush')}
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleSendPushAlert(false)}
                disabled={pushPermission !== 'granted'}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
              >
                <Send className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t('pushSummaryBtn')}</span>
              </button>
              <button
                type="button"
                onClick={() => void handleSendPushAlert(true)}
                disabled={pushPermission !== 'granted'}
                className="px-3.5 py-2 text-xs font-medium border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
              >
                {t('sendTestPushBtn')}
              </button>
            </div>
          </section>

          {/* Email Digest Card */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-slate-700 dark:text-slate-300" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t('emailTitle')}
                </h3>
              </div>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                {t('emailServerMode', {
                  mode:
                    serverEmailProvider === 'none'
                      ? t('emailPreviewMode')
                      : serverEmailProvider.toUpperCase(),
                })}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {t('emailDesc', { email: email || '—', count: alertItems.length })}
            </p>
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => void handleSendEmailDigest()}
                disabled={sendingEmail || alertItems.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-md hover:bg-slate-800 dark:hover:bg-slate-200 disabled:opacity-40 transition-colors"
              >
                <Mail className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{sendingEmail ? t('preparingDigest') : t('sendEmailBtn')}</span>
              </button>

              {lastEmailPreview && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      downloadTextFile(
                        `stockkeep-alert-${new Date().toISOString().slice(0, 10)}.eml`,
                        buildEmlFile(
                          lastEmailPreview.recipient,
                          lastEmailPreview.subject,
                          lastEmailPreview.text,
                        ),
                        'message/rfc822',
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t('downloadEml')}</span>
                  </button>
                  <a
                    href={`mailto:${encodeURIComponent(lastEmailPreview.recipient)}?subject=${encodeURIComponent(
                      lastEmailPreview.subject,
                    )}&body=${encodeURIComponent(lastEmailPreview.text)}`}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t('openEmailApp')}</span>
                  </a>
                </>
              )}
            </div>
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {t('cronScheduleTitle')}:
              </span>{' '}
              {t('cronScheduleDesc', { endpoint: '/api/cron/digest' })}
            </div>
          </section>

          {/* Webhook Relay Card */}
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Webhook className="w-4 h-4 text-slate-700 dark:text-slate-300" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t('webhookTitle')}
                </h3>
              </div>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {t('webhookDesc')}
            </p>
            <button
              type="button"
              onClick={() => void handleSendWebhook()}
              disabled={sendingWebhook || !webhookUrl.trim()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{sendingWebhook ? t('dispatching') : t('dispatchWebhookBtn')}</span>
            </button>
          </section>
        </div>
      </div>

      {lastEmailPreview && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
              {t('previewTitle', { email: lastEmailPreview.recipient })}
            </div>
            <button
              type="button"
              onClick={() => setLastEmailPreview(null)}
              className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
            >
              {t('dismiss')}
            </button>
          </div>
          <pre className="p-5 text-xs font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap overflow-x-auto bg-slate-50 dark:bg-slate-950">
            {lastEmailPreview.text}
          </pre>
        </section>
      )}

      {/* Alert History Log */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t('historyTitle')}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('historyDesc')}</p>
        </div>

        {logs.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            {t('historyEmpty')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4">{t('colChannel')}</th>
                  <th className="py-2.5 px-4">{t('colSubject')}</th>
                  <th className="py-2.5 px-4">{t('colRecipient')}</th>
                  <th className="py-2.5 px-4 text-right">{t('colItems')}</th>
                  <th className="py-2.5 px-4">{t('colOutcome')}</th>
                  <th className="py-2.5 px-4">{t('colDate')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-4 font-mono uppercase text-slate-700 dark:text-slate-300">
                      {log.channel}
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {log.subject}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 truncate max-w-md mt-0.5">
                        {log.summary}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-slate-600 dark:text-slate-400">
                      {log.recipient}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {log.itemCount}
                    </td>
                    <td className="py-2.5 px-4 font-medium">
                      {log.deliveryStatus === 'delivered' ? (
                        <span className="text-emerald-700 dark:text-emerald-400">
                          {t('outcomeDelivered')}
                        </span>
                      ) : log.deliveryStatus === 'logged_unconfigured' ? (
                        <span className="text-amber-600 dark:text-amber-400">
                          {t('outcomePrepared')}
                        </span>
                      ) : (
                        <span className="text-red-600 dark:text-red-400">{t('outcomeFailed')}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {log.createdAt?.toDate
                        ? log.createdAt.toDate().toLocaleString(locale)
                        : t('justNow')}
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
