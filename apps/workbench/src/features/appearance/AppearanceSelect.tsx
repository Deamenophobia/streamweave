import { useAppearance } from "./AppearanceProvider";
import { resolveTheme, themes, type Theme } from "./themes";

export function AppearanceSelect() {
  const { theme, saved, choose } = useAppearance();
  return (
    <div className="appearance-control">
      <label>
        <span>Appearance</span>
        <select
          aria-label="Appearance"
          value={theme}
          onChange={(event) => choose(resolveTheme(event.target.value))}
        >
          {(Object.keys(themes) as Theme[]).map((id) => (
            <option key={id} value={id}>
              {themes[id].label}
            </option>
          ))}
        </select>
      </label>
      {!saved && (
        <p className="appearance-notice" role="status">
          Applied for this session. Browser preferences could not be saved.
        </p>
      )}
    </div>
  );
}
