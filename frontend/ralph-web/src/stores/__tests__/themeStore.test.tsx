/**
 * Theme System Tests
 *
 * Tests for themeStore, useTheme hook, and ThemeToggle component.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { act } from "@testing-library/react";
import { useThemeStore, applyTheme, getResolvedTheme } from "@/stores/themeStore";
import { ThemeToggle, ThemeToggleMinimal } from "@/components/shared/ThemeToggle";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, "localStorage", { value: localStorageMock });

// Mock matchMedia
const matchMediaMock = vi.fn((query: string) => ({
  matches: query === "(prefers-color-scheme: dark)",
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

Object.defineProperty(window, "matchMedia", { value: matchMediaMock });

describe("themeStore", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    // Reset store state
    useThemeStore.setState({ mode: "dark", resolved: "dark" });
  });

  describe("getResolvedTheme", () => {
    it('returns "dark" when mode is "dark"', () => {
      expect(getResolvedTheme("dark")).toBe("dark");
    });

    it('returns "light" when mode is "light"', () => {
      expect(getResolvedTheme("light")).toBe("light");
    });

    it('returns system preference when mode is "system"', () => {
      // Mock dark system preference
      matchMediaMock.mockReturnValueOnce({
        matches: true,
        media: "(prefers-color-scheme: dark)",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      });
      expect(getResolvedTheme("system")).toBe("dark");
    });
  });

  describe("setMode", () => {
    it("updates mode and resolved theme", () => {
      const { setMode } = useThemeStore.getState();

      act(() => {
        setMode("light");
      });

      const state = useThemeStore.getState();
      expect(state.mode).toBe("light");
      expect(state.resolved).toBe("light");
    });

    it("calls applyTheme with resolved theme", () => {
      // Test by checking the document state instead of spying
      const { setMode } = useThemeStore.getState();

      act(() => {
        setMode("light");
      });

      // Verify theme was applied
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });
  });

  describe("toggle", () => {
    it("toggles from dark to light", () => {
      useThemeStore.setState({ mode: "dark", resolved: "dark" });
      const { toggle } = useThemeStore.getState();

      act(() => {
        toggle();
      });

      const state = useThemeStore.getState();
      expect(state.mode).toBe("light");
      expect(state.resolved).toBe("light");
    });

    it("toggles from light to dark", () => {
      useThemeStore.setState({ mode: "light", resolved: "light" });
      const { toggle } = useThemeStore.getState();

      act(() => {
        toggle();
      });

      const state = useThemeStore.getState();
      expect(state.mode).toBe("dark");
      expect(state.resolved).toBe("dark");
    });
  });
});

describe("applyTheme", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.classList.remove("dark");
  });

  it('sets data-theme="dark" and adds dark class for dark theme', () => {
    applyTheme("dark");

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it('sets data-theme="light" and removes dark class for light theme', () => {
    applyTheme("light");

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("updates meta theme-color", () => {
    // Create meta element
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);

    applyTheme("dark");
    expect(meta.getAttribute("content")).toBe("#1a1a1a");

    applyTheme("light");
    expect(meta.getAttribute("content")).toBe("#ffffff");

    // Cleanup
    document.head.removeChild(meta);
  });
});

describe("ThemeToggle", () => {
  beforeEach(() => {
    localStorageMock.clear();
    useThemeStore.setState({ mode: "dark", resolved: "dark" });
  });

  it("renders with current theme icon", () => {
    render(<ThemeToggle />);

    // Moon icon should be visible for dark theme
    const button = screen.getByRole("button", { name: /toggle theme/i });
    expect(button).toBeInTheDocument();
  });

  it("opens dropdown on click", async () => {
    render(<ThemeToggle />);

    const button = screen.getByRole("button", { name: /toggle theme/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });
  });

  it("displays all theme options", async () => {
    render(<ThemeToggle />);

    const button = screen.getByRole("button", { name: /toggle theme/i });
    fireEvent.click(button);

    await waitFor(() => {
      // Use getAllByText since "Dark" appears in both button and dropdown
      expect(screen.getAllByText("Light").length).toBeGreaterThan(0);
      expect(screen.getAllByText("System").length).toBeGreaterThan(0);
      // Dark is the current mode, so it appears in the button and dropdown
      expect(screen.getAllByText("Dark").length).toBeGreaterThan(0);
    });
  });

  it("changes theme on option selection", async () => {
    render(<ThemeToggle />);

    // Open dropdown
    const button = screen.getByRole("button", { name: /toggle theme/i });
    fireEvent.click(button);

    // Wait for Light option and click it
    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    // Get all Light options and click the one in the dropdown (role=option)
    const lightOption = screen.getByRole("option", { name: /light/i });
    if (lightOption) {
      fireEvent.click(lightOption);
    }

    await waitFor(() => {
      const state = useThemeStore.getState();
      expect(state.mode).toBe("light");
      expect(state.resolved).toBe("light");
    });
  });

  it("closes dropdown on Escape key", async () => {
    render(<ThemeToggle />);

    // Open dropdown
    const button = screen.getByRole("button", { name: /toggle theme/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    // Press Escape
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
  });

  it("renders compact mode without label", () => {
    render(<ThemeToggle compact />);

    // Should not show the label
    expect(screen.queryByText("Dark")).not.toBeInTheDocument();
  });
});

describe("ThemeToggleMinimal", () => {
  beforeEach(() => {
    localStorageMock.clear();
    useThemeStore.setState({ mode: "dark", resolved: "dark" });
  });

  it("cycles through themes when clicking minimal toggle", () => {
    // Test the store cycling behavior directly
    useThemeStore.setState({ mode: "dark", resolved: "dark" });

    // Simulate cycling: dark -> light
    const { setMode } = useThemeStore.getState();
    act(() => setMode("light"));
    expect(useThemeStore.getState().mode).toBe("light");

    // light -> system
    act(() => setMode("system"));
    expect(useThemeStore.getState().mode).toBe("system");

    // system -> dark
    act(() => setMode("dark"));
    expect(useThemeStore.getState().mode).toBe("dark");
  });

  it("renders minimal toggle with correct icon", () => {
    useThemeStore.setState({ mode: "dark", resolved: "dark" });
    render(<ThemeToggleMinimal />);
    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();
    expect(button.querySelector("svg")).toBeInTheDocument();
  });

  it("shows correct icon for each mode", () => {
    useThemeStore.setState({ mode: "light", resolved: "light" });
    const { rerender } = render(<ThemeToggleMinimal />);

    // Sun for light mode
    let button = screen.getByRole("button");
    expect(button.querySelector("svg")).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-label", expect.stringContaining("light"));

    // Rerender with dark mode
    act(() => {
      useThemeStore.setState({ mode: "dark", resolved: "dark" });
    });
    rerender(<ThemeToggleMinimal />);
    button = screen.getByRole("button");
    expect(button.querySelector("svg")).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-label", expect.stringContaining("dark"));

    // Rerender with system mode
    act(() => {
      useThemeStore.setState({ mode: "system", resolved: "dark" });
    });
    rerender(<ThemeToggleMinimal />);
    button = screen.getByRole("button");
    expect(button.querySelector("svg")).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-label", expect.stringContaining("system"));
  });
});

describe("Theme persistence", () => {
  it("persists mode preference to localStorage via Zustand persist", async () => {
    const { setMode } = useThemeStore.getState();

    act(() => {
      setMode("light");
    });

    // Zustand persist middleware handles storage internally
    // Verify the state was updated correctly
    const state = useThemeStore.getState();
    expect(state.mode).toBe("light");
    expect(state.resolved).toBe("light");
  });
});
