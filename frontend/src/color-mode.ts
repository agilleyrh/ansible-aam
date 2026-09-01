const STORAGE_KEY = "aam-color-mode";
const DARK_CLASS = "pf-v6-theme-dark";

export type ColorMode = "light" | "dark";

function prefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function readColorMode(): ColorMode {
  if (typeof document === "undefined") {
    return "light";
  }
  return document.documentElement.classList.contains(DARK_CLASS) ? "dark" : "light";
}

export function writeColorMode(mode: ColorMode): void {
  const dark = mode === "dark";
  document.documentElement.classList.toggle(DARK_CLASS, dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  localStorage.setItem(STORAGE_KEY, mode);
}

export function resolveInitialColorMode(): ColorMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") {
      return stored;
    }
  } catch {
    // Ignore storage access failures and fall back to the OS preference.
  }
  return prefersDark() ? "dark" : "light";
}
