import 'dotenv/config';
import crypto from 'crypto';
import express, { type Express } from 'express';
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App as AdminApp,
  type ServiceAccount,
} from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import fs from 'fs';
import nodemailer from 'nodemailer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type SupportedLocale = 'en' | 'pt-BR' | 'es' | 'fr' | 'de';

interface AlertItemPayload {
  name: string;
  foodGroup: string;
  foodGroupLabel?: string;
  quantity: number;
  unit: string;
  expirationDate: string;
  daysRemaining: number;
  storageLocation: string;
}

interface EmailRequestBody {
  recipient?: string;
  subject?: string;
  householdName?: string;
  thresholdDays?: number;
  locale?: string;
  items?: AlertItemPayload[];
}

interface WebhookRequestBody {
  webhookUrl?: string;
  subject?: string;
  summary?: string;
  locale?: string;
  items?: AlertItemPayload[];
}

interface EmailLocaleCopy {
  defaultSubject: string;
  defaultHousehold: string;
  headerTitle: string;
  headerSubtitle: (household: string, days: number) => string;
  summaryLine: (expired: number, expiring: number, days: number) => string;
  textHeader: (household: string) => string;
  textThreshold: (days: number) => string;
  textCounts: (expired: number, expiring: number) => string;
  colSupply: string;
  colFoodGroup: string;
  colQty: string;
  colExpires: string;
  colStatus: string;
  colLocation: string;
  expiredAgo: (days: number) => string;
  expiresToday: string;
  daysRemaining: (days: number) => string;
  unassigned: string;
  expShort: string;
  locShort: string;
  deliveredVia: (recipient: string, provider: string) => string;
  unconfiguredMsg: string;
  webhookDelivered: string;
  cronSubject: (count: number, days: number) => string;
}

const EMAIL_LOCALE_COPY: Record<SupportedLocale, EmailLocaleCopy> = {
  en: {
    defaultSubject: 'Stockkeep Expiration Alert',
    defaultHousehold: 'Emergency Pantry',
    headerTitle: 'Stockkeep Rotation & Expiration Alert',
    headerSubtitle: (household, days) => `${household} · ${days}-day alert window`,
    summaryLine: (expired, expiring, days) =>
      `You have <strong>${expired}</strong> expired item${expired === 1 ? '' : 's'} and <strong>${expiring}</strong> item${expiring === 1 ? '' : 's'} expiring within ${days} days.`,
    textHeader: (household) => `Stockkeep Expiration Digest — ${household}`,
    textThreshold: (days) => `Alert threshold: ${days} days`,
    textCounts: (expired, expiring) => `Expired items: ${expired} | Expiring soon: ${expiring}`,
    colSupply: 'Supply',
    colFoodGroup: 'Food Group',
    colQty: 'Qty',
    colExpires: 'Expires',
    colStatus: 'Status',
    colLocation: 'Location',
    expiredAgo: (days) => `Expired ${days}d ago`,
    expiresToday: 'Expires today',
    daysRemaining: (days) => `${days}d left`,
    unassigned: 'Unassigned',
    expShort: 'Exp',
    locShort: 'Location',
    deliveredVia: (recipient, provider) => `Email digest delivered to ${recipient} via ${provider}.`,
    unconfiguredMsg:
      'SMTP/Resend is not configured on this server. Alert digest prepared and logged; download the .eml file or launch your email app below.',
    webhookDelivered: 'Webhook notification dispatched successfully.',
    cronSubject: (count, days) => `Stockkeep Alert: ${count} supplies need rotation (${days}d window)`,
  },
  'pt-BR': {
    defaultSubject: 'Alerta de Validade Stockkeep',
    defaultHousehold: 'Despensa de Emergência',
    headerTitle: 'Alerta de Rodízio e Validade Stockkeep',
    headerSubtitle: (household, days) => `${household} · janela de alerta de ${days} dias`,
    summaryLine: (expired, expiring, days) =>
      `Você possui <strong>${expired}</strong> ${expired === 1 ? 'item vencido' : 'itens vencidos'} e <strong>${expiring}</strong> ${expiring === 1 ? 'item vencendo' : 'itens vencendo'} em até ${days} dias.`,
    textHeader: (household) => `Resumo de Validade Stockkeep — ${household}`,
    textThreshold: (days) => `Janela de alerta: ${days} dias`,
    textCounts: (expired, expiring) => `Itens vencidos: ${expired} | Vencendo em breve: ${expiring}`,
    colSupply: 'Suprimento',
    colFoodGroup: 'Grupo Alimentar',
    colQty: 'Qtd.',
    colExpires: 'Validade',
    colStatus: 'Status',
    colLocation: 'Localização',
    expiredAgo: (days) => `Vencido há ${days}d`,
    expiresToday: 'Vence hoje',
    daysRemaining: (days) => `Faltam ${days}d`,
    unassigned: 'Sem local',
    expShort: 'Val.',
    locShort: 'Local',
    deliveredVia: (recipient, provider) => `Resumo enviado para ${recipient} via ${provider}.`,
    unconfiguredMsg:
      'SMTP/Resend não está configurado neste servidor. Resumo preparado e registrado; baixe o arquivo .eml ou abra seu app de e-mail abaixo.',
    webhookDelivered: 'Notificação via webhook enviada com sucesso.',
    cronSubject: (count, days) =>
      `Alerta Stockkeep: ${count} suprimentos exigem rodízio (janela de ${days}d)`,
  },
  es: {
    defaultSubject: 'Alerta de Caducidad Stockkeep',
    defaultHousehold: 'Despensa de Emergencia',
    headerTitle: 'Alerta de Rotación y Caducidad Stockkeep',
    headerSubtitle: (household, days) => `${household} · ventana de alerta de ${days} días`,
    summaryLine: (expired, expiring, days) =>
      `Tienes <strong>${expired}</strong> ${expired === 1 ? 'artículo caducado' : 'artículos caducados'} y <strong>${expiring}</strong> ${expiring === 1 ? 'artículo que caduca' : 'artículos que caducan'} en ${days} días.`,
    textHeader: (household) => `Resumen de Caducidad Stockkeep — ${household}`,
    textThreshold: (days) => `Ventana de alerta: ${days} días`,
    textCounts: (expired, expiring) => `Caducados: ${expired} | Por caducar: ${expiring}`,
    colSupply: 'Suministro',
    colFoodGroup: 'Grupo Alimenticio',
    colQty: 'Cant.',
    colExpires: 'Caduca',
    colStatus: 'Estado',
    colLocation: 'Ubicación',
    expiredAgo: (days) => `Caducado hace ${days}d`,
    expiresToday: 'Caduca hoy',
    daysRemaining: (days) => `Quedan ${days}d`,
    unassigned: 'Sin asignar',
    expShort: 'Cad.',
    locShort: 'Ubicación',
    deliveredVia: (recipient, provider) => `Resumen enviado a ${recipient} vía ${provider}.`,
    unconfiguredMsg:
      'SMTP/Resend no está configurado en este servidor. Resumen preparado y registrado; descarga el archivo .eml o abre tu app de correo abajo.',
    webhookDelivered: 'Notificación webhook enviada correctamente.',
    cronSubject: (count, days) =>
      `Alerta Stockkeep: ${count} suministros requieren rotación (ventana de ${days}d)`,
  },
  fr: {
    defaultSubject: 'Alerte de Péremption Stockkeep',
    defaultHousehold: 'Réserve d’Urgence',
    headerTitle: 'Alerte de Rotation et Péremption Stockkeep',
    headerSubtitle: (household, days) => `${household} · fenêtre d’alerte de ${days} jours`,
    summaryLine: (expired, expiring, days) =>
      `Vous avez <strong>${expired}</strong> article${expired === 1 ? '' : 's'} expiré${expired === 1 ? '' : 's'} et <strong>${expiring}</strong> article${expiring === 1 ? '' : 's'} expirant sous ${days} jours.`,
    textHeader: (household) => `Résumé de Péremption Stockkeep — ${household}`,
    textThreshold: (days) => `Fenêtre d’alerte : ${days} jours`,
    textCounts: (expired, expiring) => `Expirés : ${expired} | Expirent bientôt : ${expiring}`,
    colSupply: 'Article',
    colFoodGroup: 'Groupe Alimentaire',
    colQty: 'Qté',
    colExpires: 'Expire le',
    colStatus: 'Statut',
    colLocation: 'Emplacement',
    expiredAgo: (days) => `Expiré depuis ${days}j`,
    expiresToday: 'Expire aujourd’hui',
    daysRemaining: (days) => `${days}j restants`,
    unassigned: 'Non assigné',
    expShort: 'Exp.',
    locShort: 'Lieu',
    deliveredVia: (recipient, provider) => `Résumé envoyé à ${recipient} via ${provider}.`,
    unconfiguredMsg:
      'SMTP/Resend n’est pas configuré sur ce serveur. Résumé préparé et enregistré ; téléchargez le fichier .eml ou ouvrez votre messagerie ci-dessous.',
    webhookDelivered: 'Notification webhook envoyée avec succès.',
    cronSubject: (count, days) =>
      `Alerte Stockkeep : ${count} articles à renouveler (fenêtre de ${days}j)`,
  },
  de: {
    defaultSubject: 'Stockkeep-Ablaufalarm',
    defaultHousehold: 'Notvorrat',
    headerTitle: 'Stockkeep Rotations- & Ablaufalarm',
    headerSubtitle: (household, days) => `${household} · ${days}-Tage-Warnfenster`,
    summaryLine: (expired, expiring, days) =>
      `Sie haben <strong>${expired}</strong> abgelaufene${expired === 1 ? 'n Artikel' : ' Artikel'} und <strong>${expiring}</strong> Artikel, ${expiring === 1 ? 'der' : 'die'} innerhalb von ${days} Tagen ablaufen.`,
    textHeader: (household) => `Stockkeep-Ablaufbericht — ${household}`,
    textThreshold: (days) => `Warnfenster: ${days} Tage`,
    textCounts: (expired, expiring) => `Abgelaufen: ${expired} | Bald fällig: ${expiring}`,
    colSupply: 'Vorrat',
    colFoodGroup: 'Lebensmittelgruppe',
    colQty: 'Menge',
    colExpires: 'Ablauf',
    colStatus: 'Status',
    colLocation: 'Lagerort',
    expiredAgo: (days) => `Seit ${days}T abgelaufen`,
    expiresToday: 'Läuft heute ab',
    daysRemaining: (days) => `Noch ${days}T`,
    unassigned: 'Nicht zugewiesen',
    expShort: 'Abl.',
    locShort: 'Ort',
    deliveredVia: (recipient, provider) => `E-Mail-Bericht an ${recipient} über ${provider} zugestellt.`,
    unconfiguredMsg:
      'SMTP/Resend ist auf diesem Server nicht konfiguriert. Bericht vorbereitet und protokolliert; laden Sie die .eml-Datei herunter oder öffnen Sie Ihre E-Mail-App.',
    webhookDelivered: 'Webhook-Benachrichtigung erfolgreich gesendet.',
    cronSubject: (count, days) =>
      `Stockkeep-Alarm: ${count} Vorräte zur Rotation fällig (${days}T-Fenster)`,
  },
};

const GROUP_LABELS: Record<SupportedLocale, Record<string, string>> = {
  en: {},
  'pt-BR': {
    'Water & Hydration': 'Água e Hidratação',
    'Grains & Starches': 'Grãos e Amidos',
    'Proteins & Legumes': 'Proteínas e Leguminosas',
    'Fruits & Vegetables': 'Frutas e Vegetais',
    'Dairy & Alternatives': 'Laticínios e Alternativas',
    'Fats, Oils & Condiments': 'Gorduras, Óleos e Condimentos',
    'Ready-to-Eat Meals': 'Refeições Prontas',
  },
  es: {
    'Water & Hydration': 'Agua e Hidratación',
    'Grains & Starches': 'Granos y Almidones',
    'Proteins & Legumes': 'Proteínas y Legumbres',
    'Fruits & Vegetables': 'Frutas y Verduras',
    'Dairy & Alternatives': 'Lácteos y Alternativas',
    'Fats, Oils & Condiments': 'Grasas, Aceites y Condimentos',
    'Ready-to-Eat Meals': 'Comidas Listas para Comer',
  },
  fr: {
    'Water & Hydration': 'Eau et Hydratation',
    'Grains & Starches': 'Céréales et Féculents',
    'Proteins & Legumes': 'Protéines et Légumineuses',
    'Fruits & Vegetables': 'Fruits et Légumes',
    'Dairy & Alternatives': 'Produits Laitiers et Alternatives',
    'Fats, Oils & Condiments': 'Matières Grasses et Condiments',
    'Ready-to-Eat Meals': 'Plats Prêts à Consommer',
  },
  de: {
    'Water & Hydration': 'Wasser & Hydration',
    'Grains & Starches': 'Getreide & Stärke',
    'Proteins & Legumes': 'Proteine & Hülsenfrüchte',
    'Fruits & Vegetables': 'Obst & Gemüse',
    'Dairy & Alternatives': 'Milchprodukte & Alternativen',
    'Fats, Oils & Condiments': 'Fette, Öle & Würzmittel',
    'Ready-to-Eat Meals': 'Fertiggerichte (MRE)',
  },
};

function resolveLocale(raw?: string): SupportedLocale {
  if (raw === 'pt-BR' || raw === 'es' || raw === 'fr' || raw === 'de' || raw === 'en') {
    return raw;
  }
  return 'en';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getConfiguredEmailProvider(): 'resend' | 'smtp' | 'none' {
  if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim().length > 0) {
    return 'resend';
  }
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return 'smtp';
  }
  return 'none';
}

function buildEmailDigest(
  locale: SupportedLocale,
  householdName: string,
  thresholdDays: number,
  items: AlertItemPayload[],
): { html: string; text: string } {
  const copy = EMAIL_LOCALE_COPY[locale];
  const groupMap = GROUP_LABELS[locale];
  const sorted = [...items].sort((a, b) => a.daysRemaining - b.daysRemaining);
  const expiredCount = sorted.filter((i) => i.daysRemaining < 0).length;
  const expiringSoonCount = sorted.length - expiredCount;

  const textLines = [
    copy.textHeader(householdName),
    copy.textThreshold(thresholdDays),
    copy.textCounts(expiredCount, expiringSoonCount),
    '',
    ...sorted.map((item) => {
      const groupName = item.foodGroupLabel || groupMap[item.foodGroup] || item.foodGroup;
      const statusLabel =
        item.daysRemaining < 0
          ? copy.expiredAgo(Math.abs(item.daysRemaining))
          : item.daysRemaining === 0
            ? copy.expiresToday
            : copy.daysRemaining(item.daysRemaining);
      return `- ${item.name} [${groupName}] — ${item.quantity} ${item.unit} · ${copy.expShort}: ${item.expirationDate} (${statusLabel}) · ${copy.locShort}: ${item.storageLocation || copy.unassigned}`;
    }),
  ];

  const rowsHtml = sorted
    .map((item) => {
      const groupName = item.foodGroupLabel || groupMap[item.foodGroup] || item.foodGroup;
      const isExpired = item.daysRemaining < 0;
      const badgeColor = isExpired ? '#DC2626' : '#D97706';
      const statusLabel = isExpired
        ? copy.expiredAgo(Math.abs(item.daysRemaining))
        : item.daysRemaining === 0
          ? copy.expiresToday
          : copy.daysRemaining(item.daysRemaining);

      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #E2E8F0;font-weight:600;color:#0F172A;">${escapeHtml(item.name)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #E2E8F0;color:#475569;">${escapeHtml(groupName)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #E2E8F0;font-family:monospace;color:#0F172A;">${item.quantity} ${escapeHtml(item.unit)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #E2E8F0;font-family:monospace;color:#0F172A;">${escapeHtml(item.expirationDate)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #E2E8F0;font-weight:600;color:${badgeColor};">${escapeHtml(statusLabel)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #E2E8F0;color:#475569;">${escapeHtml(item.storageLocation || copy.unassigned)}</td>
        </tr>
      `;
    })
    .join('');

  const html = `
    <!doctype html>
    <html lang="${locale}">
      <body style="margin:0;padding:24px;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0F172A;">
        <div style="max-width:720px;margin:0 auto;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;">
          <div style="padding:20px 24px;border-bottom:1px solid #E2E8F0;background:#0F172A;color:#FFFFFF;">
            <div style="font-size:18px;font-weight:700;">${escapeHtml(copy.headerTitle)}</div>
            <div style="font-size:13px;color:#CBD5E1;margin-top:4px;">${escapeHtml(copy.headerSubtitle(householdName, thresholdDays))}</div>
          </div>
          <div style="padding:20px 24px;">
            <p style="margin:0 0 16px;font-size:14px;line-height:1.5;color:#334155;">
              ${copy.summaryLine(expiredCount, expiringSoonCount, thresholdDays)}
            </p>
            <table style="width:100%;border-collapse:collapse;font-size:13px;text-align:left;">
              <thead>
                <tr style="background:#F8FAFC;border-bottom:1px solid #E2E8F0;color:#475569;">
                  <th style="padding:8px 12px;">${escapeHtml(copy.colSupply)}</th>
                  <th style="padding:8px 12px;">${escapeHtml(copy.colFoodGroup)}</th>
                  <th style="padding:8px 12px;">${escapeHtml(copy.colQty)}</th>
                  <th style="padding:8px 12px;">${escapeHtml(copy.colExpires)}</th>
                  <th style="padding:8px 12px;">${escapeHtml(copy.colStatus)}</th>
                  <th style="padding:8px 12px;">${escapeHtml(copy.colLocation)}</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
        </div>
      </body>
    </html>
  `;

  return { html, text: textLines.join('\n') };
}

function isSafeWebhookUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.startsWith('169.254.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

interface SendEmailResult {
  deliveryStatus: 'delivered' | 'logged_unconfigured' | 'failed';
  provider: 'resend' | 'smtp' | 'none';
  message?: string;
  error?: string;
}

async function sendEmailViaProvider(params: {
  recipient: string;
  subject: string;
  html: string;
  text: string;
  copy: EmailLocaleCopy;
}): Promise<SendEmailResult> {
  const provider = getConfiguredEmailProvider();

  if (provider === 'resend') {
    try {
      const fromAddress = process.env.SMTP_FROM || 'Stockkeep Alerts <onboarding@resend.dev>';
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [params.recipient],
          subject: params.subject,
          html: params.html,
          text: params.text,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          deliveryStatus: 'failed',
          provider: 'resend',
          error: `Resend rejected request (${response.status}): ${errorText.slice(0, 200)}`,
        };
      }

      return {
        deliveryStatus: 'delivered',
        provider: 'resend',
        message: params.copy.deliveredVia(params.recipient, 'Resend'),
      };
    } catch (err) {
      return {
        deliveryStatus: 'failed',
        provider: 'resend',
        error: err instanceof Error ? err.message : 'Resend request failed',
      };
    }
  }

  if (provider === 'smtp') {
    try {
      const smtpPort = Number(process.env.SMTP_PORT) || 587;
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: params.recipient,
        subject: params.subject,
        text: params.text,
        html: params.html,
      });

      return {
        deliveryStatus: 'delivered',
        provider: 'smtp',
        message: params.copy.deliveredVia(params.recipient, 'SMTP'),
      };
    } catch (err) {
      return {
        deliveryStatus: 'failed',
        provider: 'smtp',
        error: err instanceof Error ? err.message : 'SMTP delivery failed',
      };
    }
  }

  return {
    deliveryStatus: 'logged_unconfigured',
    provider: 'none',
    message: params.copy.unconfiguredMsg,
  };
}

function getDaysRemainingFromIso(expirationDate: string): number {
  const parts = expirationDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return 0;
  }
  const [y, m, d] = parts;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const targetUtc = Date.UTC(y, m - 1, d);
  return Math.round((targetUtc - todayUtc) / 86_400_000);
}

function isAuthorizedCronSecret(req: express.Request): {
  ok: boolean;
  status: number;
  error?: string;
} {
  const expected = process.env.CRON_SECRET?.trim() || '';
  if (!expected) {
    return {
      ok: false,
      status: 503,
      error: 'CRON_SECRET is not configured on the server.',
    };
  }

  const headerSecret = req.header('x-cron-secret')?.trim() || '';
  const authHeader = req.header('authorization')?.trim() || '';
  const bearerSecret = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const provided = headerSecret || bearerSecret;

  if (!provided) {
    return { ok: false, status: 401, error: 'Missing cron secret header.' };
  }

  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(provided, 'utf8');
  if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
    return { ok: false, status: 401, error: 'Invalid cron secret.' };
  }

  return { ok: true, status: 200 };
}

let cachedAdminFirestore: Firestore | null = null;

function hasAdminCredentialsConfig(): boolean {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim(),
  );
}

function loadFirebaseConfig(): { projectId: string; firestoreDatabaseId?: string } {
  const candidates = [
    path.resolve(__dirname, '../firebase-applet-config.json'),
    path.resolve(process.cwd(), 'firebase-applet-config.json'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return JSON.parse(fs.readFileSync(candidate, 'utf8')) as {
        projectId: string;
        firestoreDatabaseId?: string;
      };
    }
  }
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim() || '';
  const firestoreDatabaseId = process.env.FIREBASE_DATABASE_ID?.trim();
  if (projectId) {
    return { projectId, firestoreDatabaseId };
  }
  throw new Error('firebase-applet-config.json not found and FIREBASE_PROJECT_ID is unset.');
}

function getAdminFirestore(): Firestore {
  if (cachedAdminFirestore) return cachedAdminFirestore;

  const firebaseConfig = loadFirebaseConfig();

  let adminApp: AdminApp;
  const existingApps = getApps();
  if (existingApps.length > 0) {
    adminApp = existingApps[0];
  } else {
    const rawSa = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
    if (rawSa) {
      const parsed = JSON.parse(rawSa) as {
        project_id?: string;
        projectId?: string;
        private_key?: string;
        privateKey?: string;
        client_email?: string;
        clientEmail?: string;
      };
      const serviceAccount: ServiceAccount = {
        projectId: parsed.project_id || parsed.projectId || firebaseConfig.projectId,
        clientEmail: parsed.client_email || parsed.clientEmail,
        privateKey: (parsed.private_key || parsed.privateKey || '').replace(/\\n/g, '\n'),
      };
      adminApp = initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.projectId,
      });
    } else {
      adminApp = initializeApp({
        credential: applicationDefault(),
        projectId: firebaseConfig.projectId,
      });
    }
  }

  cachedAdminFirestore = firebaseConfig.firestoreDatabaseId
    ? getFirestore(adminApp, firebaseConfig.firestoreDatabaseId)
    : getFirestore(adminApp);
  return cachedAdminFirestore;
}

function formatCountdown(copy: EmailLocaleCopy, daysRemaining: number): string {
  if (daysRemaining < 0) return copy.expiredAgo(Math.abs(daysRemaining));
  if (daysRemaining === 0) return copy.expiresToday;
  return copy.daysRemaining(daysRemaining);
}

export function createApiApp(): Express {
  const app = express();
  app.use(express.json({ limit: '512kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      emailProvider: getConfiguredEmailProvider(),
      cronConfigured: Boolean(process.env.CRON_SECRET?.trim()),
      firebaseAdminConfigured: hasAdminCredentialsConfig(),
    });
  });

  app.post('/api/notifications/email', async (req, res) => {
    const body = (req.body || {}) as EmailRequestBody;
    const locale = resolveLocale(body.locale);
    const copy = EMAIL_LOCALE_COPY[locale];

    const recipient = typeof body.recipient === 'string' ? body.recipient.trim() : '';
    const subject =
      typeof body.subject === 'string' && body.subject.trim().length > 0
        ? body.subject.trim().slice(0, 160)
        : copy.defaultSubject;
    const householdName =
      typeof body.householdName === 'string' && body.householdName.trim().length > 0
        ? body.householdName.trim().slice(0, 100)
        : copy.defaultHousehold;
    const thresholdDays =
      typeof body.thresholdDays === 'number' && Number.isFinite(body.thresholdDays)
        ? Math.max(1, Math.min(365, Math.round(body.thresholdDays)))
        : 30;
    const items = Array.isArray(body.items) ? body.items.slice(0, 200) : [];

    if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      res.status(400).json({ error: 'A valid recipient email address is required.' });
      return;
    }

    if (items.length === 0) {
      res.status(400).json({ error: 'At least one expiring item is required to send a digest.' });
      return;
    }

    const { html, text } = buildEmailDigest(locale, householdName, thresholdDays, items);
    const result = await sendEmailViaProvider({ recipient, subject, html, text, copy });

    if (result.deliveryStatus === 'failed') {
      res.status(502).json({
        ...result,
        htmlPreview: html,
        textPreview: text,
      });
      return;
    }

    res.json({
      ...result,
      htmlPreview: html,
      textPreview: text,
    });
  });

  app.all('/api/cron/digest', async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed. Use GET or POST.' });
      return;
    }

    const authCheck = isAuthorizedCronSecret(req);
    if (!authCheck.ok) {
      res.status(authCheck.status).json({ ok: false, error: authCheck.error });
      return;
    }

    if (getConfiguredEmailProvider() === 'none') {
      res.status(503).json({
        ok: false,
        error: 'Email provider is not configured (set RESEND_API_KEY or SMTP_*).',
      });
      return;
    }

    let db: Firestore;
    try {
      db = getAdminFirestore();
    } catch (err) {
      res.status(503).json({
        ok: false,
        error:
          err instanceof Error
            ? `Firebase Admin initialization failed: ${err.message}`
            : 'Firebase Admin is not configured.',
      });
      return;
    }

    try {
      const usersSnap = await db
        .collection('users')
        .where('emailNotificationsEnabled', '==', true)
        .get();

      let usersChecked = 0;
      let emailsSent = 0;
      let skippedNoItems = 0;
      let skippedCadence = 0;
      let failed = 0;

      const nowMs = Date.now();
      const DAILY_WINDOW_MS = 23 * 3600 * 1000;
      const WEEKLY_WINDOW_MS = (7 * 24 - 1) * 3600 * 1000;

      for (const userDoc of usersSnap.docs) {
        usersChecked += 1;
        const userData = userDoc.data();
        const uid = typeof userData.uid === 'string' && userData.uid ? userData.uid : userDoc.id;
        const email = typeof userData.email === 'string' ? userData.email.trim() : '';
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          skippedNoItems += 1;
          continue;
        }

        const locale = resolveLocale(
          typeof userData.preferredLocale === 'string' ? userData.preferredLocale : 'en',
        );
        const copy = EMAIL_LOCALE_COPY[locale];
        const groupMap = GROUP_LABELS[locale];

        const thresholdDays =
          typeof userData.alertThresholdDays === 'number' && Number.isFinite(userData.alertThresholdDays)
            ? Math.max(1, Math.min(365, Math.round(userData.alertThresholdDays)))
            : 30;
        const digestFrequency =
          userData.digestFrequency === 'immediate' ||
          userData.digestFrequency === 'daily' ||
          userData.digestFrequency === 'weekly'
            ? userData.digestFrequency
            : 'daily';
        const householdName =
          typeof userData.displayName === 'string' && userData.displayName.trim().length > 0
            ? userData.displayName.trim().slice(0, 100)
            : copy.defaultHousehold;

        const itemsSnap = await db
          .collection('pantry_items')
          .where('userId', '==', uid)
          .where('status', '==', 'active')
          .get();

        const expiringItems: AlertItemPayload[] = [];
        for (const itemDoc of itemsSnap.docs) {
          const item = itemDoc.data();
          const expirationDate = typeof item.expirationDate === 'string' ? item.expirationDate : '';
          if (!/^\d{4}-\d{2}-\d{2}$/.test(expirationDate)) continue;
          const daysRemaining = getDaysRemainingFromIso(expirationDate);
          if (daysRemaining > thresholdDays) continue;

          const foodGroup = typeof item.foodGroup === 'string' ? item.foodGroup : '';
          expiringItems.push({
            name: typeof item.name === 'string' ? item.name : 'Supply Item',
            foodGroup,
            foodGroupLabel: groupMap[foodGroup] || foodGroup,
            quantity: typeof item.quantity === 'number' ? item.quantity : 0,
            unit: typeof item.unit === 'string' ? item.unit : 'units',
            expirationDate,
            daysRemaining,
            storageLocation:
              typeof item.storageLocation === 'string' ? item.storageLocation : '',
          });
        }

        expiringItems.sort((a, b) => a.daysRemaining - b.daysRemaining);
        if (expiringItems.length === 0) {
          skippedNoItems += 1;
          continue;
        }

        const summary =
          expiringItems
            .slice(0, 4)
            .map((i) => `${i.name} (${formatCountdown(copy, i.daysRemaining)})`)
            .join(', ')
            .slice(0, 500) || copy.defaultSubject;

        const logsSnap = await db
          .collection('notification_logs')
          .where('userId', '==', uid)
          .get();

        let lastDeliveredMs = 0;
        let lastDeliveredSummary = '';
        for (const logDoc of logsSnap.docs) {
          const log = logDoc.data();
          if (log.channel !== 'email' || log.deliveryStatus !== 'delivered') continue;
          const created = log.createdAt;
          const ms =
            created instanceof Timestamp
              ? created.toMillis()
              : created && typeof created.toMillis === 'function'
                ? created.toMillis()
                : 0;
          if (ms > lastDeliveredMs) {
            lastDeliveredMs = ms;
            lastDeliveredSummary = typeof log.summary === 'string' ? log.summary : '';
          }
        }

        const elapsedMs = lastDeliveredMs > 0 ? nowMs - lastDeliveredMs : Number.POSITIVE_INFINITY;
        if (digestFrequency === 'daily' && elapsedMs < DAILY_WINDOW_MS) {
          skippedCadence += 1;
          continue;
        }
        if (digestFrequency === 'weekly' && elapsedMs < WEEKLY_WINDOW_MS) {
          skippedCadence += 1;
          continue;
        }
        if (
          digestFrequency === 'immediate' &&
          elapsedMs < DAILY_WINDOW_MS &&
          lastDeliveredSummary === summary
        ) {
          skippedCadence += 1;
          continue;
        }

        const cappedItems = expiringItems.slice(0, 200);
        const subject = copy.cronSubject(cappedItems.length, thresholdDays).slice(0, 160);
        const { html, text } = buildEmailDigest(locale, householdName, thresholdDays, cappedItems);

        const sendResult = await sendEmailViaProvider({
          recipient: email,
          subject,
          html,
          text,
          copy,
        });

        await db.collection('notification_logs').add({
          userId: uid,
          channel: 'email',
          recipient: email.slice(0, 160),
          subject,
          itemCount: Math.min(1000, cappedItems.length),
          deliveryStatus: sendResult.deliveryStatus,
          summary,
          createdAt: FieldValue.serverTimestamp(),
        });

        if (sendResult.deliveryStatus === 'delivered') {
          emailsSent += 1;
        } else {
          failed += 1;
        }
      }

      res.json({
        ok: true,
        usersChecked,
        emailsSent,
        skippedNoItems,
        skippedCadence,
        failed,
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Automated digest run failed.',
      });
    }
  });

  app.post('/api/notifications/webhook', async (req, res) => {
    const body = (req.body || {}) as WebhookRequestBody;
    const locale = resolveLocale(body.locale);
    const copy = EMAIL_LOCALE_COPY[locale];

    const webhookUrl = typeof body.webhookUrl === 'string' ? body.webhookUrl.trim() : '';
    const subject =
      typeof body.subject === 'string' && body.subject.trim().length > 0
        ? body.subject.trim().slice(0, 160)
        : copy.defaultSubject;
    const summary = typeof body.summary === 'string' ? body.summary.slice(0, 500) : '';
    const items = Array.isArray(body.items) ? body.items.slice(0, 50) : [];

    if (!webhookUrl || !isSafeWebhookUrl(webhookUrl)) {
      res.status(400).json({ error: 'Please provide a valid public HTTP/HTTPS webhook URL.' });
      return;
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `${subject}\n${summary}`,
          title: subject,
          summary,
          locale,
          items,
          sentAt: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        res.status(502).json({
          deliveryStatus: 'failed',
          error: `Webhook endpoint returned HTTP ${response.status}.`,
        });
        return;
      }

      res.json({
        deliveryStatus: 'delivered',
        message: copy.webhookDelivered,
      });
    } catch (err) {
      res.status(502).json({
        deliveryStatus: 'failed',
        error: err instanceof Error ? err.message : 'Webhook request failed.',
      });
    }
  });

  return app;
}

const app = createApiApp();
export default app;
