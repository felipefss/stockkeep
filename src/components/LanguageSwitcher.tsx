import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { LANGUAGES, useI18n, type Locale } from '../i18n';

function CountryFlag({ code }: { code: Locale }) {
  if (code === 'pt-BR') {
    return (
      <svg
        viewBox="0 0 24 16"
        className="w-5 h-3.5 rounded-[2px] border border-slate-300/70 dark:border-slate-700 shrink-0"
        aria-hidden="true"
      >
        <rect width="24" height="16" fill="#009B3A" />
        <polygon points="12,2 22,8 12,14 2,8" fill="#FFDF00" />
        <circle cx="12" cy="8" r="3.4" fill="#002776" />
      </svg>
    );
  }
  if (code === 'es') {
    return (
      <svg
        viewBox="0 0 24 16"
        className="w-5 h-3.5 rounded-[2px] border border-slate-300/70 dark:border-slate-700 shrink-0"
        aria-hidden="true"
      >
        <rect width="24" height="4" fill="#AA151B" />
        <rect y="4" width="24" height="8" fill="#F1BF00" />
        <rect y="12" width="24" height="4" fill="#AA151B" />
      </svg>
    );
  }
  if (code === 'fr') {
    return (
      <svg
        viewBox="0 0 24 16"
        className="w-5 h-3.5 rounded-[2px] border border-slate-300/70 dark:border-slate-700 shrink-0"
        aria-hidden="true"
      >
        <rect width="8" height="16" fill="#0055A4" />
        <rect x="8" width="8" height="16" fill="#FFFFFF" />
        <rect x="16" width="8" height="16" fill="#EF4135" />
      </svg>
    );
  }
  if (code === 'de') {
    return (
      <svg
        viewBox="0 0 24 16"
        className="w-5 h-3.5 rounded-[2px] border border-slate-300/70 dark:border-slate-700 shrink-0"
        aria-hidden="true"
      >
        <rect width="24" height="5.33" fill="#000000" />
        <rect y="5.33" width="24" height="5.34" fill="#DD0000" />
        <rect y="10.67" width="24" height="5.33" fill="#FFCE00" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 16"
      className="w-5 h-3.5 rounded-[2px] border border-slate-300/70 dark:border-slate-700 shrink-0"
      aria-hidden="true"
    >
      <rect width="24" height="16" fill="#B22234" />
      <rect y="2.3" width="24" height="2" fill="#FFFFFF" />
      <rect y="6.3" width="24" height="2" fill="#FFFFFF" />
      <rect y="10.3" width="24" height="2" fill="#FFFFFF" />
      <rect y="14" width="24" height="2" fill="#FFFFFF" />
      <rect width="11" height="8.6" fill="#3C3B6E" />
    </svg>
  );
}

export function LanguageSwitcher({ placement = 'up' }: { placement?: 'up' | 'down' }) {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const currentLang = LANGUAGES.find((l) => l.code === locale) || LANGUAGES[0];

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) {
      document.addEventListener('mousedown', handleOutside);
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title={`${t('languageTooltip')}: ${currentLang.label}`}
        aria-label={`${t('languageTooltip')}: ${currentLang.label}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="group relative inline-flex items-center gap-1 px-2 py-2 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 dark:focus-visible:ring-slate-200"
      >
        <CountryFlag code={locale} />
        <ChevronDown className="w-3 h-3 text-slate-400" aria-hidden="true" />
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full right-0 mb-1.5 px-2 py-1 text-[11px] font-medium bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-150"
        >
          {currentLang.label}
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t('languageTooltip')}
          className={`absolute right-0 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md shadow-lg py-1 z-50 ${
            placement === 'down' ? 'top-full mt-2' : 'bottom-full mb-2'
          }`}
        >
          {LANGUAGES.map((lang) => {
            const selected = lang.code === locale;
            return (
              <button
                key={lang.code}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  setLocale(lang.code);
                  setOpen(false);
                }}
                className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 transition-colors ${
                  selected
                    ? 'bg-slate-100 dark:bg-slate-800 font-semibold text-slate-900 dark:text-slate-100'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <CountryFlag code={lang.code} />
                  <span className="truncate">{lang.label}</span>
                </span>
                {selected && (
                  <Check className="w-3.5 h-3.5 text-slate-900 dark:text-slate-100 shrink-0" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
