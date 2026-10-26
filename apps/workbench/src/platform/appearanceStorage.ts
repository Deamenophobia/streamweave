const appearanceKey = "streamweave.appearance.v1";

export function readAppearancePreference(): string | null {
  try {
    return localStorage.getItem(appearanceKey);
  } catch {
    return null;
  }
}

export function saveAppearancePreference(value: string): boolean {
  try {
    localStorage.setItem(appearanceKey, value);
    return true;
  } catch {
    return false;
  }
}

export function applyDocumentAppearance(id: string, chromeColor: string): void {
  document.documentElement.dataset.theme = id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", chromeColor);
}
