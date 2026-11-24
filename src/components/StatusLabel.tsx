import { AlertTriangle, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { useI18n } from '../i18n';
import { getDaysRemaining, getExpirationBucket } from '../utils/inventory';

interface StatusLabelProps {
  expirationDate: string;
  thresholdDays: number;
  status: 'active' | 'consumed' | 'discarded';
}

export function ExpirationStatusLabel({
  expirationDate,
  thresholdDays,
  status,
}: StatusLabelProps) {
  const { t } = useI18n();

  if (status === 'consumed') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{t('statusConsumed')}</span>
      </span>
    );
  }

  if (status === 'discarded') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
        <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{t('statusDiscarded')}</span>
      </span>
    );
  }

  const days = getDaysRemaining(expirationDate);
  const bucket = getExpirationBucket(expirationDate, thresholdDays);
  const label =
    days < 0
      ? t('statusExpiredAgo', { days: Math.abs(days) })
      : days === 0
        ? t('statusExpiresToday')
        : t('statusDaysLeft', { days });

  if (bucket === 'expired') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400 tabular-nums whitespace-nowrap">
        <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }

  if (bucket === 'critical') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400 tabular-nums whitespace-nowrap">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }

  if (bucket === 'warning') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 tabular-nums whitespace-nowrap">
        <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 tabular-nums whitespace-nowrap">
      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
