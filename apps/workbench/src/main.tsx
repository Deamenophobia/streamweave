import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AppearanceProvider, initializeAppearance } from "./features/appearance/AppearanceProvider";
import "@xyflow/react/dist/style.css";
import "./style.css";
import "./workspace.css";
import "./features/appearance/appearance.css";
import "./features/appearance/classic.css";
const initialTheme = initializeAppearance();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppearanceProvider initialTheme={initialTheme}>
      <App />
    </AppearanceProvider>
  </StrictMode>,
);
