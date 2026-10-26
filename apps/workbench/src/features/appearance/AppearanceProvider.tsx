import { createContext, useContext, useState, type ReactNode } from "react";
import {
  applyDocumentAppearance,
  readAppearancePreference,
  saveAppearancePreference,
} from "../../platform/appearanceStorage";
import { resolveTheme, themes, type Theme } from "./themes";

type Appearance = {
  theme: Theme;
  saved: boolean;
  choose: (theme: Theme) => void;
};

const AppearanceContext = createContext<Appearance | null>(null);

/** Apply before React mounts so a saved Studio preference does not flash Classic. */
export function initializeAppearance(): Theme {
  const theme = resolveTheme(readAppearancePreference());
  applyDocumentAppearance(theme, themes[theme].chromeColor);
  return theme;
}

export function AppearanceProvider({
  initialTheme,
  children,
}: {
  initialTheme: Theme;
  children: ReactNode;
}) {
  const [theme, setTheme] = useState(initialTheme);
  const [saved, setSaved] = useState(true);

  function choose(next: Theme) {
    applyDocumentAppearance(next, themes[next].chromeColor);
    setTheme(next);
    setSaved(saveAppearancePreference(next));
  }

  return (
    <AppearanceContext.Provider value={{ theme, saved, choose }}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance(): Appearance {
  const appearance = useContext(AppearanceContext);
  if (!appearance) throw new Error("Appearance controls require an AppearanceProvider.");
  return appearance;
}
