/**
 * ThemeToggle Component
 *
 * A dropdown menu for switching between light, dark, and system themes.
 * Displays the current theme state and provides quick access to all options.
 *
 * Features:
 * - Three options: Light, Dark, System
 * - Visual indicators for current selection
 * - Keyboard accessible
 * - Dropdown with smooth animations
 *
 * @see P3-1: Theme System in Ralph Web Dashboard Plan
 */

import { useState, useRef, useEffect } from "react";
import { Sun, Moon, Monitor, ChevronDown } from "lucide-react";
import { useTheme, type ThemeMode } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

interface ThemeOption {
  mode: ThemeMode;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const themeOptions: ThemeOption[] = [
  {
    mode: "light",
    label: "Light",
    description: "Light theme for daytime use",
    icon: <Sun className="h-4 w-4" />,
  },
  {
    mode: "dark",
    label: "Dark",
    description: "Dark theme (hacker aesthetic)",
    icon: <Moon className="h-4 w-4" />,
  },
  {
    mode: "system",
    label: "System",
    description: "Follow system preference",
    icon: <Monitor className="h-4 w-4" />,
  },
];

interface ThemeToggleProps {
  /** Additional class names */
  className?: string;
  /** Compact mode - show only icon without label */
  compact?: boolean;
  /** Variant style */
  variant?: "default" | "ghost" | "outline";
}

export function ThemeToggle({
  className,
  compact = false,
  variant = "ghost",
}: ThemeToggleProps) {
  const { mode, resolved, setMode } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Get current theme option
  const currentOption = themeOptions.find((opt) => opt.mode === mode);

  // Get icon based on resolved theme (actual displayed theme)
  const ResolvedIcon = resolved === "dark" ? Moon : Sun;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return;

      if (event.key === "Escape") {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleSelect = (selectedMode: ThemeMode) => {
    setMode(selectedMode);
    setIsOpen(false);
    buttonRef.current?.focus();
  };

  const variantStyles = {
    default: "bg-secondary hover:bg-secondary/80",
    ghost: "hover:bg-accent hover:text-accent-foreground",
    outline: "border border-border hover:bg-accent hover:text-accent-foreground",
  };

  return (
    <div className={cn("relative", className)} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background",
          "disabled:opacity-50 disabled:pointer-events-none",
          variantStyles[variant]
        )}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label="Toggle theme"
      >
        <ResolvedIcon className="h-4 w-4" />
        {!compact && (
          <>
            <span className="hidden sm:inline">{currentOption?.label}</span>
            <ChevronDown
              className={cn(
                "h-3 w-3 transition-transform",
                isOpen && "rotate-180"
              )}
            />
          </>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className={cn(
            "absolute z-50 mt-2 min-w-[200px] rounded-md border border-border",
            "bg-popover p-1 shadow-lg animate-in fade-in-0 zoom-in-95",
            "right-0 sm:right-auto sm:left-0"
          )}
          role="listbox"
          aria-label="Theme options"
        >
          {themeOptions.map((option) => (
            <button
              key={option.mode}
              onClick={() => handleSelect(option.mode)}
              className={cn(
                "flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-sm",
                "transition-colors outline-none",
                "focus:bg-accent focus:text-accent-foreground",
                "hover:bg-accent hover:text-accent-foreground",
                mode === option.mode && "bg-accent/50"
              )}
              role="option"
              aria-selected={mode === option.mode}
            >
              <span
                className={cn(
                  "flex-shrink-0",
                  mode === option.mode
                    ? "text-primary"
                    : "text-muted-foreground"
                )}
              >
                {option.icon}
              </span>
              <div className="flex flex-col items-start text-left">
                <span className="font-medium">{option.label}</span>
                <span className="text-xs text-muted-foreground">
                  {option.description}
                </span>
              </div>
              {mode === option.mode && (
                <span className="ml-auto text-primary text-xs">Active</span>
              )}
            </button>
          ))}

          {/* Keyboard hint */}
          <div className="border-t border-border mt-1 pt-1 px-3 py-1.5">
            <span className="text-xs text-muted-foreground">
              <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Esc</kbd>{" "}
              to close
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Minimal theme toggle button - just cycles through options
 * Good for compact spaces like mobile nav or toolbar
 */
export function ThemeToggleMinimal({ className }: { className?: string }) {
  const { mode, setMode } = useTheme();

  const cycleTheme = () => {
    const order: ThemeMode[] = ["light", "dark", "system"];
    const currentIndex = order.indexOf(mode);
    const nextIndex = (currentIndex + 1) % order.length;
    setMode(order[nextIndex]);
  };

  return (
    <button
      onClick={cycleTheme}
      className={cn(
        "p-2 rounded-md hover:bg-accent hover:text-accent-foreground",
        "transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
        className
      )}
      aria-label={`Current theme: ${mode}. Click to change.`}
    >
      {mode === "light" && <Sun className="h-5 w-5" />}
      {mode === "dark" && <Moon className="h-5 w-5" />}
      {mode === "system" && <Monitor className="h-5 w-5" />}
    </button>
  );
}
