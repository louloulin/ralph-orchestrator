/**
 * LocaleSwitcher Component
 *
 * Dropdown component for switching between available locales.
 * Uses the i18n store for locale management.
 *
 * @see P3-2: i18n Support in Ralph Web Dashboard Plan
 */

import { useState, useRef, useEffect } from "react";
import { Globe, Check } from "lucide-react";
import { useI18nStore, LOCALES } from "@/stores/i18nStore";
import { useTranslation } from "@/hooks/useTranslation";
import { cn, generateAriaId } from "@/lib/utils";

interface LocaleSwitcherProps {
  /** Additional CSS classes */
  className?: string;

  /** Compact mode - shows only globe icon */
  compact?: boolean;
}

/**
 * Dropdown component for switching locales.
 */
export function LocaleSwitcher({ className, compact = false }: LocaleSwitcherProps) {
  const { locale, setLocale } = useI18nStore();
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listboxId = useRef(generateAriaId("locale-listbox")).current;

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Handle keyboard navigation
  function handleKeyDown(event: React.KeyboardEvent) {
    switch (event.key) {
      case "Escape":
        setIsOpen(false);
        buttonRef.current?.focus();
        break;
      case "ArrowDown":
        event.preventDefault();
        // Focus first item
        const firstItem = dropdownRef.current?.querySelector('[role="option"]');
        (firstItem as HTMLElement)?.focus();
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        setIsOpen(!isOpen);
        break;
    }
  }

  function handleLocaleSelect(newLocale: typeof locale) {
    setLocale(newLocale);
    setIsOpen(false);
    buttonRef.current?.focus();
  }

  const currentLocale = LOCALES.find((l) => l.code === locale);

  return (
    <div ref={dropdownRef} className={cn("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-label={t("settings.language")}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className={cn(
          "flex items-center gap-2 rounded-md text-sm font-medium transition-colors",
          "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          compact ? "p-2" : "px-3 py-2"
        )}
      >
        <Globe className="h-4 w-4" />
        {!compact && (
          <span className="truncate">{currentLocale?.nativeName || locale}</span>
        )}
      </button>

      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={t("settings.language")}
          className={cn(
            "absolute z-50 mt-1 min-w-[160px] rounded-md border border-border bg-popover p-1 shadow-md",
            compact ? "right-0" : "left-0"
          )}
        >
          {LOCALES.map((loc) => (
            <button
              key={loc.code}
              role="option"
              aria-selected={locale === loc.code}
              onClick={() => handleLocaleSelect(loc.code)}
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
                "hover:bg-accent hover:text-accent-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                locale === loc.code && "bg-accent/50"
              )}
            >
              <span className="w-4 h-4 flex items-center justify-center">
                {locale === loc.code && <Check className="h-3.5 w-3.5" />}
              </span>
              <span className="flex-1 truncate">{loc.nativeName}</span>
              {loc.code !== locale && (
                <span className="text-xs text-muted-foreground">{loc.name}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Minimal locale switcher for compact spaces (sidebar, toolbar).
 * Cycles through available locales on click.
 */
export function LocaleSwitcherMinimal({ className }: { className?: string }) {
  const { locale, setLocale } = useI18nStore();

  const handleClick = () => {
    const currentIndex = LOCALES.findIndex((l) => l.code === locale);
    const nextIndex = (currentIndex + 1) % LOCALES.length;
    setLocale(LOCALES[nextIndex].code);
  };

  const currentLocale = LOCALES.find((l) => l.code === locale);

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`Switch to ${currentLocale?.name || "next"} language`}
      className={cn(
        "flex items-center justify-center rounded-md text-sm font-medium transition-colors",
        "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "w-full px-3 py-2",
        className
      )}
    >
      <Globe className="h-4 w-4 mr-2" />
      <span className="truncate text-xs">{currentLocale?.code || "en"}</span>
    </button>
  );
}
