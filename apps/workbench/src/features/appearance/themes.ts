export const themes = {
  classic: { label: "Classic · Retro", colorMode: "light", chromeColor: "#30353b" },
  studio: { label: "Studio · Original", colorMode: "dark", chromeColor: "#101719" },
} as const;

export type Theme = keyof typeof themes;

export function resolveTheme(value: unknown): Theme {
  return value === "studio" ? "studio" : "classic";
}
