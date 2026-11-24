import { useEffect, useRef, useState } from 'react';
import { signInWithPopup, signOut, onAuthStateChanged, type User } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  Bell,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  Plus,
  Sun,
  X,
} from 'lucide-react';
import { CatalogueView } from './components/CatalogueView';
import { FoodGroupsView } from './components/FoodGroupsView';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { NotificationsView } from './components/NotificationsView';
import { OverviewDashboard } from './components/OverviewDashboard';
import { SupplyModal } from './components/SupplyModal';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './firebase';
import { useI18n } from './i18n';
import {
  BLUEPRINT_LIMITS,
  type DeliveryStatus,
  type DigestFrequency,
  type FoodGroup,
  type NotificationChannel,
  type NotificationLog,
  type PantryItem,
  type PantryItemInput,
  type UserProfile,
} from './types';
import { getDaysRemaining, getSampleEmergencyPantry, sanitizePantryInput } from './utils/inventory';
import { getPushPermission, sendBrowserPushNotification } from './utils/notifications';

type ActiveView = 'overview' | 'catalogue' | 'groups' | 'notifications';

export default function App() {
  const { locale, t } = useI18n();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [items, setItems] = useState<PantryItem[]>([]);
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [loadingSample, setLoadingSample] = useState(false);

  const [activeView, setActiveView] = useState<ActiveView>('overview');
  const [catalogueFoodGroup, setCatalogueFoodGroup] = useState<FoodGroup | 'ALL'>('ALL');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PantryItem | null>(null);
  const [defaultModalGroup, setDefaultModalGroup] = useState<FoodGroup | undefined>(undefined);

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('stockkeep-theme') === 'dark';
  });

  const sessionAlertSentRef = useRef(false);

  const viewLabels: Record<ActiveView, string> = {
    overview: t('viewOverview'),
    catalogue: t('viewCatalogue'),
    groups: t('viewFoodGroups'),
    notifications: t('viewNotifications'),
  };

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('stockkeep-theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('stockkeep-theme', 'light');
    }
  }, [darkMode]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        setProfile(null);
        setItems([]);
        setLogs([]);
        setDataLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady || !user) return;
    setDataLoading(true);

    const userDocRef = doc(db, 'users', user.uid);
    const unsubProfile = onSnapshot(
      userDocRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setProfile(snapshot.data() as UserProfile);
        } else {
          const initialEmail = (user.email || 'user@example.com').slice(0, BLUEPRINT_LIMITS.EMAIL_MAX);
          const initialName = (user.displayName || t('defaultPantryName')).slice(
            0,
            BLUEPRINT_LIMITS.DISPLAY_NAME_MAX,
          );
          setDoc(userDocRef, {
            uid: user.uid,
            email: initialEmail,
            displayName: initialName,
            emailNotificationsEnabled: true,
            pushNotificationsEnabled: true,
            alertThresholdDays: 30,
            digestFrequency: 'daily',
            webhookUrl: '',
            householdSize: 2,
            preferredLocale: locale,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }).catch((err) => handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}`));
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${user.uid}`),
    );

    const itemsQuery = query(collection(db, 'pantry_items'), where('userId', '==', user.uid));
    const unsubItems = onSnapshot(
      itemsQuery,
      (snapshot) => {
        const nextItems: PantryItem[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<PantryItem, 'id'>),
        }));
        setItems(nextItems);
        setDataLoading(false);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'pantry_items'),
    );

    const logsQuery = query(collection(db, 'notification_logs'), where('userId', '==', user.uid));
    const unsubLogs = onSnapshot(
      logsQuery,
      (snapshot) => {
        const nextLogs: NotificationLog[] = snapshot.docs
          .map((d) => ({
            id: d.id,
            ...(d.data() as Omit<NotificationLog, 'id'>),
          }))
          .sort((a, b) => {
            const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return tb - ta;
          });
        setLogs(nextLogs);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'notification_logs'),
    );

    return () => {
      unsubProfile();
      unsubItems();
      unsubLogs();
    };
  }, [authReady, user]);

  useEffect(() => {
    if (
      sessionAlertSentRef.current ||
      !user ||
      !profile ||
      !profile.pushNotificationsEnabled ||
      items.length === 0
    ) {
      return;
    }

    if (getPushPermission() !== 'granted') return;

    const alreadyNotified = sessionStorage.getItem(`stockkeep-session-push-${user.uid}`);
    if (alreadyNotified) {
      sessionAlertSentRef.current = true;
      return;
    }

    const threshold = profile.alertThresholdDays || 30;
    const urgent = items.filter(
      (i) => i.status === 'active' && getDaysRemaining(i.expirationDate) <= threshold,
    );

    if (urgent.length > 0) {
      sessionAlertSentRef.current = true;
      sessionStorage.setItem(`stockkeep-session-push-${user.uid}`, '1');
      const formatCountdown = (expirationDate: string) => {
        const d = getDaysRemaining(expirationDate);
        if (d < 0) return t('statusExpiredAgo', { days: Math.abs(d) });
        if (d === 0) return t('statusExpiresToday');
        return t('statusDaysLeft', { days: d });
      };
      sendBrowserPushNotification(
        t('pushSessionTitle', { count: urgent.length }),
        urgent
          .slice(0, 3)
          .map((i) => `${i.name} (${formatCountdown(i.expirationDate)})`)
          .join(' · '),
      );
    }
  }, [user, profile, items]);

  useEffect(() => {
    if (!user || !profile) return;
    if (profile.preferredLocale === locale) return;
    updateDoc(doc(db, 'users', user.uid), {
      preferredLocale: locale,
      updatedAt: serverTimestamp(),
    }).catch((err) => handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`));
  }, [user, profile, locale]);

  async function handleGoogleSignIn() {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to sign in with Google.');
    }
  }

  async function handleSignOut() {
    await signOut(auth);
  }

  async function handleSaveSupply(rawInput: PantryItemInput, existingId?: string) {
    if (!user) return;
    const input = sanitizePantryInput(rawInput);

    if (existingId) {
      const ref = doc(db, 'pantry_items', existingId);
      try {
        await updateDoc(ref, {
          name: input.name,
          foodGroup: input.foodGroup,
          quantity: input.quantity,
          targetMinQuantity: input.targetMinQuantity,
          unit: input.unit,
          caloriesPerUnit: input.caloriesPerUnit,
          storageLocation: input.storageLocation,
          expirationDate: input.expirationDate,
          notes: input.notes,
          status: input.status,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `pantry_items/${existingId}`);
      }
    } else {
      try {
        await addDoc(collection(db, 'pantry_items'), {
          userId: user.uid,
          name: input.name,
          foodGroup: input.foodGroup,
          quantity: input.quantity,
          targetMinQuantity: input.targetMinQuantity,
          unit: input.unit,
          caloriesPerUnit: input.caloriesPerUnit,
          storageLocation: input.storageLocation,
          expirationDate: input.expirationDate,
          notes: input.notes,
          status: input.status,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'pantry_items');
      }
    }
  }

  async function handleAdjustQuantity(item: PantryItem, delta: number) {
    const nextQty = Math.max(0, Math.min(BLUEPRINT_LIMITS.QUANTITY_MAX, item.quantity + delta));
    const ref = doc(db, 'pantry_items', item.id);
    try {
      await updateDoc(ref, {
        quantity: nextQty,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `pantry_items/${item.id}`);
    }
  }

  async function handleToggleStatus(item: PantryItem) {
    const nextStatus = item.status === 'active' ? 'consumed' : 'active';
    const ref = doc(db, 'pantry_items', item.id);
    try {
      await updateDoc(ref, {
        status: nextStatus,
        quantity: item.quantity,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `pantry_items/${item.id}`);
    }
  }

  async function handleDeleteItem(item: PantryItem) {
    const ref = doc(db, 'pantry_items', item.id);
    try {
      await deleteDoc(ref);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `pantry_items/${item.id}`);
    }
  }

  async function handleDeleteItems(itemIds: string[]) {
    const uniqueIds = Array.from(new Set(itemIds)).filter(Boolean);
    if (uniqueIds.length === 0) return;

    const CHUNK_SIZE = 450;
    try {
      for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
        const chunk = uniqueIds.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        for (const id of chunk) {
          batch.delete(doc(db, 'pantry_items', id));
        }
        await batch.commit();
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'pantry_items');
    }
  }

  async function handleLoadSampleData() {
    if (!user) return;
    setLoadingSample(true);
    try {
      const batch = writeBatch(db);
      const samples = getSampleEmergencyPantry();
      for (const sample of samples) {
        const clean = sanitizePantryInput(sample);
        const newRef = doc(collection(db, 'pantry_items'));
        batch.set(newRef, {
          userId: user.uid,
          name: clean.name,
          foodGroup: clean.foodGroup,
          quantity: clean.quantity,
          targetMinQuantity: clean.targetMinQuantity,
          unit: clean.unit,
          caloriesPerUnit: clean.caloriesPerUnit,
          storageLocation: clean.storageLocation,
          expirationDate: clean.expirationDate,
          notes: clean.notes,
          status: clean.status,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'pantry_items');
    } finally {
      setLoadingSample(false);
    }
  }

  async function handleSavePreferences(updates: {
    email: string;
    displayName: string;
    emailNotificationsEnabled: boolean;
    pushNotificationsEnabled: boolean;
    alertThresholdDays: number;
    digestFrequency: DigestFrequency;
    webhookUrl: string;
    householdSize: number;
  }) {
    if (!user) return;
    const userDocRef = doc(db, 'users', user.uid);
    try {
      await updateDoc(userDocRef, {
        email: updates.email.slice(0, BLUEPRINT_LIMITS.EMAIL_MAX),
        displayName: updates.displayName.slice(0, BLUEPRINT_LIMITS.DISPLAY_NAME_MAX),
        emailNotificationsEnabled: updates.emailNotificationsEnabled,
        pushNotificationsEnabled: updates.pushNotificationsEnabled,
        alertThresholdDays: updates.alertThresholdDays,
        digestFrequency: updates.digestFrequency,
        webhookUrl: updates.webhookUrl.slice(0, BLUEPRINT_LIMITS.WEBHOOK_MAX),
        householdSize: updates.householdSize,
        preferredLocale: locale,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    }
  }

  async function handleRecordNotificationLog(entry: {
    channel: NotificationChannel;
    recipient: string;
    subject: string;
    itemCount: number;
    deliveryStatus: DeliveryStatus;
    summary: string;
  }) {
    if (!user) return;
    try {
      await addDoc(collection(db, 'notification_logs'), {
        userId: user.uid,
        channel: entry.channel,
        recipient: entry.recipient.slice(0, BLUEPRINT_LIMITS.EMAIL_MAX),
        subject: entry.subject.slice(0, BLUEPRINT_LIMITS.SUBJECT_MAX) || 'Stockkeep Alert',
        itemCount: Math.max(0, Math.min(1000, Math.round(entry.itemCount))),
        deliveryStatus: entry.deliveryStatus,
        summary: entry.summary.slice(0, BLUEPRINT_LIMITS.SUMMARY_MAX) || 'Alert dispatched',
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'notification_logs');
    }
  }

  function openAddModal(defaultGroup?: FoodGroup) {
    setEditingItem(null);
    setDefaultModalGroup(defaultGroup);
    setModalOpen(true);
  }

  function openEditModal(item: PantryItem) {
    setEditingItem(item);
    setDefaultModalGroup(undefined);
    setModalOpen(true);
  }

  const thresholdDays = profile?.alertThresholdDays ?? 30;
  const urgentCount = items.filter(
    (item) => item.status === 'active' && getDaysRemaining(item.expirationDate) <= thresholdDays,
  ).length;

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
          {t('loadingApp')}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-center items-center p-6">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-8 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Stockkeep
            </h1>
            <LanguageSwitcher placement="down" />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            {t('appTagline')}
          </p>

          {authError && (
            <div className="p-3 text-xs font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-md">
              {authError}
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <button
              type="button"
              onClick={() => void handleGoogleSignIn()}
              className="w-full px-4 py-2.5 text-sm font-semibold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-md hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors"
            >
              {t('signInGoogle')}
            </button>
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
              {t('signInNote')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const navItems: { key: ActiveView; label: string; icon: typeof LayoutDashboard; count?: number }[] = [
    { key: 'overview', label: t('navOverview'), icon: LayoutDashboard },
    { key: 'catalogue', label: t('navCatalogue'), icon: Package, count: items.length },
    { key: 'groups', label: t('navFoodGroups'), icon: Layers },
    {
      key: 'notifications',
      label: t('navNotifications'),
      icon: Bell,
      count: urgentCount > 0 ? urgentCount : undefined,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:fixed lg:inset-y-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
        <div className="h-14 px-5 flex items-center border-b border-slate-200 dark:border-slate-800">
          <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
            Stockkeep
          </span>
        </div>

        <nav className="flex-1 p-3 space-y-1" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveView(item.key)}
                className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.count !== undefined && (
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      active
                        ? 'text-slate-300 dark:text-slate-600'
                        : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between gap-1">
            <button
              type="button"
              onClick={() => setDarkMode((prev) => !prev)}
              className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap"
            >
              {darkMode ? (
                <Sun className="w-4 h-4 shrink-0" aria-hidden="true" />
              ) : (
                <Moon className="w-4 h-4 shrink-0" aria-hidden="true" />
              )}
              <span className="truncate">
                {darkMode ? t('lightAppearance') : t('darkAppearance')}
              </span>
            </button>
            <LanguageSwitcher />
          </div>

          <div className="px-3 py-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                {user.displayName || t('defaultPantryName')}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {user.email}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              title={t('signOut')}
              aria-label={t('signOut')}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-64 max-w-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col z-50">
            <div className="h-14 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
              <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Stockkeep
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <nav className="flex-1 p-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeView === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setActiveView(item.key);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md ${
                      active
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </span>
                  </button>
                );
              })}
            </nav>

            <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between gap-1">
                <button
                  type="button"
                  onClick={() => setDarkMode((prev) => !prev)}
                  className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400"
                >
                  {darkMode ? <Sun className="w-4 h-4 shrink-0" /> : <Moon className="w-4 h-4 shrink-0" />}
                  <span className="truncate">
                    {darkMode ? t('lightAppearance') : t('darkAppearance')}
                  </span>
                </button>
                <LanguageSwitcher />
              </div>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400"
              >
                <LogOut className="w-4 h-4" />
                <span>{t('signOut')}</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-60 flex flex-col min-w-0">
        <header className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-sm truncate">
              <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {profile?.displayName || t('defaultPantryName')}
              </span>
              <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                {viewLabels[activeView]}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => openAddModal()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-md hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('addSupply')}</span>
          </button>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
          {activeView === 'overview' && (
            <OverviewDashboard
              items={items}
              profile={profile}
              loading={dataLoading}
              onOpenAddModal={() => openAddModal()}
              onEditItem={openEditModal}
              onAdjustQuantity={handleAdjustQuantity}
              onMarkConsumed={handleToggleStatus}
              onLoadSampleData={handleLoadSampleData}
              loadingSample={loadingSample}
              onNavigateToCatalogue={(group) => {
                setCatalogueFoodGroup(group || 'ALL');
                setActiveView('catalogue');
              }}
              onNavigateToNotifications={() => setActiveView('notifications')}
            />
          )}

          {activeView === 'catalogue' && (
            <CatalogueView
              items={items}
              thresholdDays={thresholdDays}
              selectedFoodGroup={catalogueFoodGroup}
              onSelectFoodGroup={setCatalogueFoodGroup}
              onOpenAddModal={(group) => openAddModal(group)}
              onEditItem={openEditModal}
              onAdjustQuantity={handleAdjustQuantity}
              onToggleStatus={handleToggleStatus}
              onDeleteItem={handleDeleteItem}
              onDeleteItems={handleDeleteItems}
            />
          )}

          {activeView === 'groups' && (
            <FoodGroupsView
              items={items}
              thresholdDays={thresholdDays}
              onAddToGroup={(group) => openAddModal(group)}
              onInspectGroup={(group) => {
                setCatalogueFoodGroup(group);
                setActiveView('catalogue');
              }}
            />
          )}

          {activeView === 'notifications' && (
            <NotificationsView
              profile={profile}
              items={items}
              logs={logs}
              onSavePreferences={handleSavePreferences}
              onRecordNotificationLog={handleRecordNotificationLog}
            />
          )}
        </main>
      </div>

      <SupplyModal
        isOpen={modalOpen}
        editingItem={editingItem}
        defaultFoodGroup={defaultModalGroup}
        onClose={() => setModalOpen(false)}
        onSave={handleSaveSupply}
      />
    </div>
  );
}
